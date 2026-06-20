const jwt = require('jsonwebtoken');
const User = require('../models/User');

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
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: `Role ${req.user ? req.user.role : 'Guest'} is not authorized` });
    }
    next();
  };
};

const authorizeAdminPortal = (req, res, next) => {
  const isLegacyAdmin = req.user?.role === 'Admin';
  const isCustomAdmin = req.user?.accountType === 'admin' && req.user?.roleRef;

  if (!isLegacyAdmin && !isCustomAdmin) {
    return res.status(403).json({ message: 'Admin portal access is required' });
  }

  next();
};

module.exports = { protect, authorize, authorizeAdminPortal };
