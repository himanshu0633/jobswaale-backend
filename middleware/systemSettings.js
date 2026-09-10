const { getSettings } = require('../utils/settings');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { isSuperAdminAccount } = require('./auth');

const getRequestUser = async (req) => {
  if (req.user) return req.user;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
    return await User.findById(decoded.id).select('-password').populate('roleRef');
  } catch (error) {
    return null;
  }
};

const maintenanceGuard = async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!settings.maintenanceMode) return next();

    // 1. Settings public check (needed by frontend to know maintenance state)
    if (req.path === '/api/settings/public' || req.path === '/settings/public') {
      return next();
    }

    // 2. Superadmin auth routes so admin can authenticate and manage site
    const adminAuthPaths = [
      '/api/auth/superadmin-login',
      '/api/auth/verify-admin',
      '/api/auth/seed-admin',
      '/api/auth/forgot-password',
      '/auth/superadmin-login',
      '/auth/verify-admin',
      '/auth/seed-admin',
      '/auth/forgot-password'
    ];

    if (adminAuthPaths.includes(req.path)) {
      return next();
    }

    // 3. Static uploads
    if (req.path.startsWith('/uploads') || req.path.startsWith('/api/uploads')) {
      return next();
    }

    // 4. Authenticated SuperAdmin check:
    // Any request from a verified SuperAdmin account is fully permitted across all routes
    const user = await getRequestUser(req);
    if (user && isSuperAdminAccount(user)) {
      req.user = user;
      return next();
    }

    // 5. All other endpoints are blocked during maintenance mode
    return res.status(503).json({
      message: 'Website is under maintenance. Please try again later.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { maintenanceGuard };
