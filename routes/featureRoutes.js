const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getFeatures, createFeature, updateFeature, deleteFeature } = require('../controllers/featureController');

router.get('/features', getFeatures);
router.post('/features', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createFeature);
router.put('/features/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateFeature);
router.delete('/features/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteFeature);

module.exports = router;
