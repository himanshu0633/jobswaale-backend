const express = require('express');
const router = express.Router();
const { register, login, googleLogin, seedAdmin, createAdmin, forgotPassword } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

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

module.exports = router;
