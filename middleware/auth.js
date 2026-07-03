const jwt = require('jsonwebtoken');
const User = require('../models/User');

const SUPER_ADMIN_ROLES = ['admin', 'superadmin', 'super admin'];

const isSuperAdminAccount = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  const roleName = String(user?.roleRef?.name || user?.roleName || '').trim().toLowerCase();
  return SUPER_ADMIN_ROLES.includes(role) || SUPER_ADMIN_ROLES.includes(roleName);
};

const protect = async (req, res, next) => {
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
      req.user = await User.findById(decoded.id).select('-password').populate('roleRef');
      if (!req.user) {
        return res.status(401).json({ message: 'User no longer exists' });
      }
      next();
    } catch (error) {
      if (error.name && error.name.startsWith('Mongo')) {
        console.error('Auth DB Error:', error.message);
        return res.status(503).json({ message: 'Database connection unavailable. Please try again.' });
      }
      console.error('Auth Error:', error.message);
      res.status(401).json({ message: 'Not authorized, token failed' });
    }
  } else {
    res.status(401).json({ message: 'Not authorized, no token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    const allowed = roles.includes(req.user?.role) || (roles.includes('Admin') && isSuperAdminAccount(req.user));
    if (!req.user || !allowed) {
      return res.status(403).json({ message: `Role ${req.user ? req.user.role : 'Guest'} is not authorized` });
    }
    next();
  };
};

const authorizeAdminPortal = (req, res, next) => {
  if (!isSuperAdminAccount(req.user)) {
    return res.status(403).json({ message: 'Super admin access is required' });
  }

  next();
};

const authorizeEmployerPortal = (req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const accountType = String(req.user?.accountType || '').trim().toLowerCase();

  if (role !== 'employer' && accountType !== 'employer') {
    return res.status(403).json({ message: 'Employer access is required' });
  }

  next();
};

module.exports = { protect, authorize, authorizeAdminPortal, authorizeEmployerPortal, isSuperAdminAccount };
