const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getJobCategories,
  getPendingJobCategoryRequests,
  requestJobCategory,
  approveJobCategory,
  createJobCategory,
  updateJobCategory,
  deleteJobCategory
} = require('../controllers/jobCategoryController');

router.get('/job-categories', getJobCategories);
router.get('/job-categories/pending-requests', protect, authorizeAdminPortal, authorize('Admin'), getPendingJobCategoryRequests);
router.post('/job-categories/request', protect, requestJobCategory);
router.put('/job-categories/:uid/approve', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, approveJobCategory);
router.post('/job-categories', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createJobCategory);
router.put('/job-categories/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateJobCategory);
router.delete('/job-categories/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteJobCategory);

module.exports = router;
