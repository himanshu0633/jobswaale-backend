const User = require('../models/User');
const jwt = require('jsonwebtoken');
const { allPermissions } = require('../utils/permissions');

// Helper to generate JWT token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123', {
    expiresIn: '30d'
  });
};

// @desc    Register a new user (Jobseeker/Employer only)
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password || !role) {
      return res.status(400).json({ message: 'Please provide email, password and role' });
    }

    if (role === 'Admin') {
      return res.status(400).json({ message: 'Admins cannot register from public endpoint' });
    }

    if (!['Jobseeker', 'Employer'].includes(role)) {
      return res.status(400).json({ message: 'Invalid role selection' });
    }

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists with this email' });
    }

    const user = await User.create({
      email,
      password,
      role,
      accountType: role === 'Employer' ? 'employer' : 'jobseeker',
      status: 'active'
    });

    res.status(201).json({
      _id: user._id,
      email: user.email,
      role: user.role,
      token: generateToken(user._id)
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

    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
    }

    const user = await User.findOne({ email }).populate('roleRef');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    if (user.status !== 'active') {
      return res.status(401).json({ message: 'User account is inactive' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    user.lastLogin = new Date();
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
      token: generateToken(user._id)
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
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide admin email and password' });
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
      token: generateToken(admin._id)
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
    if (!email || !password) {
      return res.status(400).json({ message: 'Please provide email and password' });
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
