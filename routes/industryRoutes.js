const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getIndustryTypes,
  getPendingIndustryRequests,
  requestIndustryType,
  approveIndustryType,
  createIndustryType,
  updateIndustryType,
  deleteIndustryType
} = require('../controllers/industryController');

router.get('/industry-types', getIndustryTypes);
router.get('/industry-types/pending-requests', protect, authorizeAdminPortal, authorize('Admin'), getPendingIndustryRequests);
router.post('/industry-types/request', protect, requestIndustryType);
router.put('/industry-types/:uid/approve', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, approveIndustryType);
router.post('/industry-types', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createIndustryType);
router.put('/industry-types/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateIndustryType);
router.delete('/industry-types/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteIndustryType);

module.exports = router;
