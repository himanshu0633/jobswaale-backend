const express = require('express');
const router = express.Router();
const { register, login, googleLogin, seedAdmin, createAdmin, forgotPassword } = require('../controllers/authController');
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.post('/superadmin-login', (req, res, next) => {
  req.superAdminOnly = true;
  next();
}, login);
router.post('/seed-admin', seedAdmin);
router.post('/create-admin', protect, authorize('Admin'), createAdmin);
router.post('/forgot-password', forgotPassword);

router.get('/verify-admin', protect, authorizeAdminPortal, (req, res) => {
  res.json({
    success: true,
    user: {
      _id: req.user._id,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      email: req.user.email,
      role: req.user.role,
      roleName: req.user.roleRef?.name || req.user.role,
      accountType: req.user.accountType
    }
  });
});

module.exports = router;
