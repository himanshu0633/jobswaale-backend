const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getDistricts, createDistrict, updateDistrict, deleteDistrict } = require('../controllers/districtController');

router.get('/districts', getDistricts);
router.post('/districts', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createDistrict);
router.put('/districts/:id', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateDistrict);
router.delete('/districts/:id', protect, authorizeAdminPortal, authorize('Admin'), deleteDistrict);

module.exports = router;
