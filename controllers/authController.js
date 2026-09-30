const User = require('../models/User');
const Employer = require('../models/Employer');
const Plan = require('../models/Plan');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const { allPermissions } = require('../utils/permissions');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification, sendPasswordResetEmail } = require('../utils/mail');
const { isSuperAdminAccount } = require('../middleware/auth');
const { seedEmployerPlansIfEmpty } = require('../utils/seedEmployerPlans');
const {
  findDuplicateEmail,
  findDuplicateMobile,
  normalizeEmail,
  validateMobileNumber
} = require('../utils/userCredentials');

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

const getDefaultFreePlan = async (category) => {
  if (category === 'Employer') {
    await seedEmployerPlansIfEmpty();
  }

  const existingPlan = await Plan.findOne({
    category,
    cost: 0,
    isDeleted: { $ne: true },
    status: { $ne: 'inactive' }
  }).sort({ displayOrder: 1, createDate: 1 }).select('_id planName').lean();
  if (existingPlan) return existingPlan;

  const admin = await User.findOne({ role: 'Admin', isDeleted: { $ne: true } }).sort({ createDate: 1 }).select('_id');
  if (!admin) return null;

  const createdPlan = await Plan.create({
    category,
    planName: 'Free',
    planSubtitle: category === 'Employer' ? 'Start hiring with your first free job post' : 'Start your journey with us',
    cost: 0,
    planValidity: 'Always Free',
    planType: 'Free',
    displayOrder: 0,
    unlockCount: '0',
    freeJobPosts: category === 'Employer' ? 1 : 0,
    showBadge: true,
    badge: 'FREE',
    employerFeatures: category === 'Employer' ? ['Employer Dashboard', 'First Job Post Free'] : [],
    status: 'active',
    login: admin._id,
    ip: '127.0.0.1'
  });

  return { _id: createdPlan._id, planName: createdPlan.planName };
};

const getUserResponse = (user, rolePermissions = []) => ({
  _id: user._id,
  firstName: user.firstName,
  lastName: user.lastName,
  username: user.username,
  email: user.email,
  role: user.role,
  roleRef: user.roleRef?._id || null,
  roleName: user.roleRef?.name || user.role,
  accountType: user.accountType,
  profileImage: user.profileImage,
  permissions: rolePermissions
});

const verifyGoogleToken = async (token) => {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;

  if (!googleClientId) {
    throw new Error('Google login is not configured');
  }

  const googleClient = new OAuth2Client(googleClientId);
  const ticket = await googleClient.verifyIdToken({
    idToken: token,
    audience: googleClientId
  });

  return ticket.getPayload();
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

    const normalizedEmail = normalizeEmail(email);
    const userExists = await findDuplicateEmail(normalizedEmail);
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    if (!phone || !String(phone).trim()) {
      return res.status(400).json({ message: 'Please provide a valid 10-digit mobile number' });
    }
    const normalizedPhone = validateMobileNumber(phone);
    const phoneExists = await findDuplicateMobile(normalizedPhone);
    if (phoneExists) {
      return res.status(400).json({ message: 'Mobile number already exists' });
    }

    const nameParts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = nameParts.shift() || '';
    const lastName = nameParts.join(' ');
    const defaultPlan = await getDefaultFreePlan(role);
    const selectedPlanId = defaultPlan?._id || null;
    const selectedPlanName = defaultPlan?.planName || '';

    const user = await User.create({
      firstName,
      lastName,
      phone: normalizedPhone,
      workStatus: role === 'Jobseeker' ? String(workStatus || '').trim() : '',
      selectedPlan: selectedPlanId,
      updatesConsent: updatesConsent !== false,
      companyName: role === 'Employer' ? String(companyName || '').trim() : '',
      designation: role === 'Employer' ? String(designation || '').trim() : '',
      companyType: role === 'Employer' ? String(companyType || '').trim() : '',
      companySize: role === 'Employer' ? String(companySize || '').trim() : '',
      email: normalizedEmail,
      password,
      role,
      accountType: role === 'Employer' ? 'employer' : 'jobseeker',
      status: 'active'
    });

    if (role === 'Employer') {
      await Employer.create({
        userId: user._id,
        login: user._id,
        companyName: String(companyName || '').trim(),
        contactPerson: String(fullName || '').trim(),
        phone: normalizedPhone,
        companySize: String(companySize || '').trim(),
        currentPlan: selectedPlanId,
        status: 'active',
        ip: req.clientIp || '127.0.0.1'
      });
    }

    await sendAdminNotification({
      enabled: role === 'Employer' ? settings.notifNewEmp : settings.notifNewApp,
      subject: `New ${role} registration`,
      title: `New ${role} Registration`,
      rows: [
        { label: 'Name', value: String(fullName || '').trim() || '-' },
        { label: 'Email', value: normalizedEmail },
        { label: 'Phone', value: normalizedPhone || '-' },
        ...(role === 'Employer' ? [
          { label: 'Company', value: String(companyName || '').trim() || '-' },
          { label: 'Designation', value: String(designation || '').trim() || '-' },
          { label: 'Company Type', value: String(companyType || '').trim() || '-' },
          { label: 'Company Size', value: String(companySize || '').trim() || '-' },
          { label: 'Default Plan', value: selectedPlanName || '-' }
        ] : [
          { label: 'Work Status', value: String(workStatus || '').trim() || '-' },
          { label: 'Default Plan', value: selectedPlanName || '-' }
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
      selectedPlan: user.selectedPlan,
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
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0];
      const message = duplicateField === 'phone'
        ? 'Mobile number already exists'
        : 'User already exists with this email';
      return res.status(400).json({ message });
    }
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
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

    user.lastLogin = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    const rolePermissions = user.roleRef
      ? (user.roleRef.permissions || [])
      : (user.role === 'Admin' ? allPermissions : []);

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
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Auth user with Google ID token
// @route   POST /api/auth/google
// @access  Public
exports.googleLogin = async (req, res) => {
  try {
    const { token, role = 'jobseeker' } = req.body;
    const selectedAccountType = String(role || '').trim().toLowerCase();

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ message: 'Google ID token is required' });
    }

    if (!['jobseeker', 'employer'].includes(selectedAccountType)) {
      return res.status(400).json({ message: 'Invalid account type selection' });
    }

    let payload;
    try {
      payload = await verifyGoogleToken(token);
    } catch (error) {
      const status = error.message === 'Google login is not configured' ? 500 : 401;
      return res.status(status).json({ message: status === 500 ? error.message : 'Invalid Google token' });
    }

    const googleId = payload.sub;
    const email = String(payload.email || '').trim().toLowerCase();
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    const name = String(payload.name || '').trim();
    const profileImage = String(payload.picture || '').trim();

    if (!googleId || !email || !emailVerified) {
      return res.status(401).json({ message: 'Google account email could not be verified' });
    }

    let user = await User.findOne({
      $or: [
        { email },
        { 'providers.googleId': googleId }
      ]
    }).populate('roleRef');

    if (user?.providers?.googleId && user.providers.googleId !== googleId) {
      return res.status(409).json({ message: 'This email is already linked to another Google account' });
    }

    if (user) {
      const existingAccountType = String(user.accountType || user.role || '').trim().toLowerCase();
      const existingRole = String(user.role || '').trim().toLowerCase();

      if (
        (selectedAccountType === 'jobseeker' && existingAccountType !== 'jobseeker' && existingRole !== 'jobseeker') ||
        (selectedAccountType === 'employer' && existingAccountType !== 'employer' && existingRole !== 'employer')
      ) {
        return res.status(403).json({ message: 'Please select the correct account type for this login.' });
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

      if (!user.providers) user.providers = {};
      if (!user.providers.googleId) user.providers.googleId = googleId;
      if (!user.profileImage && profileImage) user.profileImage = profileImage;
      user.lastLogin = new Date();
      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      await user.save();
    } else {
      const nameParts = name.split(/\s+/).filter(Boolean);
      const firstName = nameParts.shift() || '';
      const lastName = nameParts.join(' ');
      const newRole = selectedAccountType === 'employer' ? 'Employer' : 'Jobseeker';
      const defaultPlan = await getDefaultFreePlan(newRole);
      const selectedPlanId = defaultPlan?._id || null;

      user = await User.create({
        firstName,
        lastName,
        email,
        password: crypto.randomBytes(32).toString('hex'),
        role: newRole,
        accountType: selectedAccountType,
        selectedPlan: selectedPlanId,
        profileImage,
        providers: { googleId },
        status: 'active',
        lastLogin: new Date()
      });

      if (selectedAccountType === 'employer') {
        await Employer.create({
          userId: user._id,
          login: user._id,
          companyName: name || email.split('@')[0],
          contactPerson: name,
          phone: 'Not provided',
          currentPlan: selectedPlanId,
          status: 'active',
          ip: req.clientIp || '127.0.0.1'
        });
      }

      user = await User.findById(user._id).populate('roleRef');
    }

    const rolePermissions = user.role === 'Admin'
      ? allPermissions
      : (user.roleRef?.permissions || []);
    const userData = getUserResponse(user, rolePermissions);

    res.json({
      success: true,
      token: generateToken(user._id, '30d'),
      user: userData
    });
  } catch (error) {
    console.error('Google Login Error:', error);
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
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
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
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
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Forgot Password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !String(email).trim()) {
      return res.status(400).json({ message: 'Please provide your email address' });
    }

    const normalized = String(email).trim().toLowerCase();
    const user = await User.findOne({ email: normalized, isDeleted: false });
    if (!user) {
      return res.status(404).json({ message: 'Oops! Email is not in our database. Please try again.' });
    }

    // Generate secure random reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Save token and 1-hour expiration
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);
    await user.save({ validateBeforeSave: false });

    // Derive frontend reset URL based on requester origin or env
    let baseUrl = process.env.FRONTEND_URL || 'https://jobswaale.vercel.app';
    if (req.headers.origin) {
      baseUrl = req.headers.origin;
    } else if (req.headers.referer) {
      try {
        baseUrl = new URL(req.headers.referer).origin;
      } catch {}
    }
    const resetUrl = `${baseUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`;

    console.log(`[AUTH] Password reset requested for ${normalized}. Reset URL: ${resetUrl}`);

    const mailResult = await sendPasswordResetEmail({
      to: user.email,
      firstName: user.firstName,
      resetUrl
    });

    if (mailResult && mailResult.sent) {
      return res.json({
        success: true,
        message: 'Reset password link sent successfully! Check your email.'
      });
    }

    // Fallback: If mail delivery skipped or SMTP not configured
    console.warn(`[AUTH] Password reset email not sent (${mailResult?.reason || 'unconfigured'}). Providing recovery link.`);
    return res.json({
      success: true,
      delivered: false,
      message: 'Password reset link generated. Check your email, or use the direct reset link below if email delivery is not configured on this server.',
      resetUrl
    });
  } catch (error) {
    console.error('Forgot Password Error:', error);
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};

// @desc    Verify Reset Password Token
// @route   GET /api/auth/verify-reset-token
// @access  Public
exports.verifyResetToken = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.status(400).json({ valid: false, message: 'Reset token is required' });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
      isDeleted: false
    });

    if (!user) {
      return res.status(400).json({
        valid: false,
        message: 'Password reset link is invalid or has expired. Please request a new one.'
      });
    }

    return res.json({
      valid: true,
      email: user.email,
      firstName: user.firstName,
      accountType: user.accountType,
      role: user.role
    });
  } catch (error) {
    console.error('Verify Reset Token Error:', error);
    res.status(500).json({ valid: false, message: 'Server error' });
  }
};

// @desc    Reset Password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token) {
      return res.status(400).json({ message: 'Reset token is missing or invalid' });
    }
    if (!password) {
      return res.status(400).json({ message: 'Please provide a new password' });
    }

    const settings = await getSettings();
    const minPassLen = settings.minPassLen || 8;
    if (String(password).length < minPassLen) {
      return res.status(400).json({ message: `Password must be at least ${minPassLen} characters long` });
    }

    const hashedToken = crypto.createHash('sha256').update(String(token)).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
      isDeleted: false
    });

    if (!user) {
      return res.status(400).json({
        message: 'Password reset link is invalid or has expired. Please request a new one.'
      });
    }

    // Set new password - User Schema pre('save') hashes it
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.passwordChangedAt = new Date();
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    console.log(`[AUTH] Password reset successfully for ${user.email}`);

    res.json({
      success: true,
      message: 'Password has been reset successfully! You can now sign in with your new password.',
      accountType: user.accountType,
      role: user.role
    });
  } catch (error) {
    console.error('Reset Password Error:', error);
    if (error.message && error.name !== 'TypeError' && error.name !== 'ReferenceError') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Server error' });
  }
};
