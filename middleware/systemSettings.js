const { getSettings } = require('../utils/settings');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const isAdminUser = (user) => user?.role === 'Admin' || (user?.accountType === 'admin' && user?.roleRef);

const getRequestUser = async (req) => {
  if (req.user) return req.user;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;

  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
    return User.findById(decoded.id).select('-password').populate('roleRef');
  } catch (error) {
    return null;
  }
};

const maintenanceGuard = async (req, res, next) => {
  try {
    const settings = await getSettings();
    if (!settings.maintenanceMode) return next();

    const openPaths = [
      '/api/auth/login',
      '/api/auth/seed-admin',
      '/api/settings/public'
    ];

    if (openPaths.includes(req.path) || req.path.startsWith('/api/settings')) {
      return next();
    }

    const user = await getRequestUser(req);
    if (isAdminUser(user)) return next();

    return res.status(503).json({
      message: 'Website is under maintenance. Please try again later.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { maintenanceGuard };
