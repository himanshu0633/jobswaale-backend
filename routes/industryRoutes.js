const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getIndustryTypes, createIndustryType, updateIndustryType, deleteIndustryType } = require('../controllers/industryController');

router.use(protect, authorizeAdminPortal);
router.get('/industry-types', getIndustryTypes);
router.post('/industry-types', authorize('Admin'), auditMiddleware, createIndustryType);
router.put('/industry-types/:uid', authorize('Admin'), auditMiddleware, updateIndustryType);
router.delete('/industry-types/:uid', authorize('Admin'), deleteIndustryType);

module.exports = router;
