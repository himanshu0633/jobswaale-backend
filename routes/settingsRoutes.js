const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const {
  getSettings,
  getPublicSettings,
  updateSettings,
  sendTestEmail,
  uploadImage
} = require('../controllers/settingsController');
const { createImageUpload } = require('../middleware/imageUpload');

router.get('/public', getPublicSettings);
router.get('/', protect, authorizeAdminPortal, getSettings);
router.put('/', protect, authorizeAdminPortal, updateSettings);
router.post('/upload-image', protect, authorizeAdminPortal, createImageUpload('site')('image'), uploadImage);
router.post('/test-email', protect, authorizeAdminPortal, sendTestEmail);

module.exports = router;
