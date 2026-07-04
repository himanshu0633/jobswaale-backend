const User = require('../models/User');
const Employer = require('../models/Employer');
const jwt = require('jsonwebtoken');
const { allPermissions } = require('../utils/permissions');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification } = require('../utils/mail');
const { isSuperAdminAccount } = require('../middleware/auth');

// Helper to generate JWT token
const generateToken = (id, expiresIn = '30d') => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123', {
    expiresIn
  });
};

const getBlacklistedEmployer = async (userId) => {
  return Employer.findOne({
    userId,
    isDeleted: { $ne: true },
    status: 'blacklist'
  }).select('blacklistReason companyName').lean();
};

// @desc    Register a new user (Jobseeker/Employer only)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const {
      email,
      password,
      role,
      fullName = '',
      phone = '',
      workStatus = '',
      updatesConsent = true,
      companyName = '',
      designation = '',
      companyType = '',
      companySize = ''
    } = req.body;
    const settings = await getSettings();

    if (!settings.userRegistration) {
      return res.status(403).json({ message: 'New user registration is currently disabled.' });
    }

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Please provide email, password and role' });
    }

    if (password.length < settings.minPassLen) {
      return res.status(400).json({ message: `Password must be at least ${settings.minPassLen} characters` });
    }

    if (role === 'Admin') {
      return res.status(400).json({ message: 'Admins cannot register from public endpoint' });
    }

    if (!['Jobseeker', 'Employer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role selection' });
    }

    if (role === 'Employer' && (!companyName || !designation || !companyType || !companySize)) {
      return res.status(400).json({ message: 'Please provide complete company details' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const nameParts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || '';
    const lastName = nameParts.join(' ');

    const user = await User.create({
      firstName,
      lastName,
      phone: String(phone || '').trim(),
      workStatus: role === 'Jobseeker' ? String(workStatus || '').trim() : '',
      updatesConsent: updatesConsent !== false,
      companyName: role === 'Employer' ? String(companyName || '').trim() : '',
      designation: role === 'Employer' ? String(designation || '').trim() : '',
      companyType: role === 'Employer' ? String(companyType || '').trim() : '',
      companySize: role === 'Employer' ? String(companySize || '').trim() : '',
      email,
      password,
      role,
      accountType: role === 'Employer' ? 'employer' : 'jobseeker',
      status: 'active'
    });

    await sendAdminNotification({
      enabled: role === 'Employer' ? settings.notifNewEmp : settings.notifNewApp,
      subject: `New ${role} registration`,
      title: `New ${role} Registration`,
      rows: [
        { label: 'Name', value: String(fullName || '').trim() || '-' },
        { label: 'Email', value: email },
        { label: 'Phone', value: String(phone || '').trim() || '-' },
        ...(role === 'Employer' ? [
          { label: 'Company', value: String(companyName || '').trim() || '-' },
          { label: 'Designation', value: String(designation || '').trim() || '-' },
          { label: 'Company Type', value: String(companyType || '').trim() || '-' },
          { label: 'Company Size', value: String(companySize || '').trim() || '-' }
        ] : [
          { label: 'Work Status', value: String(workStatus || '').trim() || '-' }
        ]),
        { label: 'Role', value: role },
        { label: 'Status', value: user.status }
      ]
    });

    res.status(201).json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      workStatus: user.workStatus,
      companyName: user.companyName,
      designation: user.designation,
      companyType: user.companyType,
      companySize: user.companySize,
      email: user.email,
      role: user.role,
      token: generateToken(user._id, '30d')
    });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Auth user & get token (Login)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const settings = await getSettings();

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).populate('roleRef');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.accountType === 'employer' || user.role === 'Employer') {
      const blacklistedEmployer = await getBlacklistedEmployer(user._id);
      if (blacklistedEmployer) {
        const reason = String(blacklistedEmployer.blacklistReason || '').trim();
        return res.status(403).json({
          message: reason
            ? `Your employer account has been blacklisted. Reason: ${reason}`
            : 'Your employer account has been blacklisted. Please contact admin.',
          accountStatus: 'blacklisted',
          blacklistReason: reason,
          companyName: blacklistedEmployer.companyName || ''
        });
      }
    }

    if (user.status !== 'active') {
      return res.status(401).json({ message: 'User account is inactive' });
    }

    if (user.lockUntil && user.lockUntil > new Date()) {
      return res.status(423).json({ message: `Account is locked. Try again after ${user.lockUntil.toLocaleString()}.` });
    }

    if (user.lockUntil && user.lockUntil <= new Date()) {
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;
      if (user.failedLoginAttempts >= settings.maxLoginAttempts) {
        user.lockUntil = new Date(Date.now() + settings.lockoutDuration * 60 * 1000);
      }
      await user.save();
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (req.superAdminOnly && !isSuperAdminAccount(user)) {
      return res.status(403).json({ message: 'Only super admin can access the admin portal' });
    }

    if (settings.passExpiry > 0 && user.passwordChangedAt) {
      const ageMs = Date.now() - new Date(user.passwordChangedAt).getTime();
      const expiryMs = settings.passExpiry * 24 * 60 * 60 * 1000;
      if (ageMs > expiryMs) {
        return res.status(403).json({ message: 'Your password has expired. Please contact admin to reset it.' });
      }
    }

    user.lastLogin = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const rolePermissions = user.role === 'Admin'
      ? allPermissions
      : (user.roleRef?.permissions || []);

    res.json({
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      username: user.username,
      email: user.email,
      role: user.role,
      roleRef: user.roleRef?._id || null,
      roleName: user.roleRef?.name || user.role,
      accountType: user.accountType,
      permissions: rolePermissions,
      token: generateToken(user._id, '30d')
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Seed the first Admin user
// @route   POST /api/auth/seed-admin
// @access  Public (Only works if no Admins exist)
exports.seedAdmin = async (req, res) => {
  try {
    const adminExists = await User.findOne({ role: 'Admin' });
    if (adminExists) {
      return res.status(400).json({ message: 'Admin user already exists. Seed unavailable.' });
    }

    const { email, password } = req.body;
    const settings = await getSettings();
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide admin email and password' });
    }

    if (password.length < settings.minPassLen) {
      return res.status(400).json({ message: `Password must be at least ${settings.minPassLen} characters` });
    }

    const admin = await User.create({
      email,
      password,
      role: 'Admin',
      accountType: 'admin',
      status: 'active'
    });

    res.status(201).json({
      message: 'Initial Admin seeded successfully',
      email: admin.email,
      role: admin.role,
      token: generateToken(admin._id, '30d')
    });
  } catch (error) {
    console.error('Seed Admin Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Create an Admin user (Admin only)
// @route   POST /api/auth/create-admin
// @access  Private/Admin
exports.createAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const settings = await getSettings();
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    if (password.length < settings.minPassLen) {
      return res.status(400).json({ message: `Password must be at least ${settings.minPassLen} characters` });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const newAdmin = await User.create({
      email,
      password,
      role: 'Admin',
      accountType: 'admin',
      status: 'active'
    });

    res.status(201).json({
      message: 'New Admin created successfully',
      email: newAdmin.email,
      role: newAdmin.role
    });
  } catch (error) {
    console.error('Create Admin Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Please provide email address' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: 'Oops! Email is not in our database. Please try again.' });
    }

    res.json({ message: 'Reset password link sent successfully! Check your email.' });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};
