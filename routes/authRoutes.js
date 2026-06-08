const express = require('express');
const router = express.Router();
const { register, login, seedAdmin, createAdmin } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');

router.post('/register', register);
router.post('/login', login);
router.post('/seed-admin', seedAdmin);
router.post('/create-admin', protect, authorize('Admin'), createAdmin);

module.exports = router;
