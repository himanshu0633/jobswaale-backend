const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getFeatures, createFeature, updateFeature, deleteFeature } = require('../controllers/featureController');

router.use(protect, authorizeAdminPortal);
router.get('/features', getFeatures);
router.post('/features', authorize('Admin'), auditMiddleware, createFeature);
router.put('/features/:uid', authorize('Admin'), auditMiddleware, updateFeature);
router.delete('/features/:uid', authorize('Admin'), deleteFeature);

module.exports = router;
