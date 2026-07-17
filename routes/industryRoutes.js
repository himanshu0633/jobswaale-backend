const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getIndustryTypes, createIndustryType, updateIndustryType, deleteIndustryType } = require('../controllers/industryController');

router.get('/industry-types', getIndustryTypes);
router.post('/industry-types', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createIndustryType);
router.put('/industry-types/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateIndustryType);
router.delete('/industry-types/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteIndustryType);

module.exports = router;
