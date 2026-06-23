const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const {
  getSettings,
  getPublicSettings,
  updateSettings,
  sendTestEmail
} = require('../controllers/settingsController');

router.get('/public', getPublicSettings);
router.get('/', protect, authorizeAdminPortal, getSettings);
router.put('/', protect, authorizeAdminPortal, updateSettings);
router.post('/test-email', protect, authorizeAdminPortal, sendTestEmail);

module.exports = router;
