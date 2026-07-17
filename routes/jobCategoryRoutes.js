const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getJobCategories, createJobCategory, updateJobCategory, deleteJobCategory } = require('../controllers/jobCategoryController');

router.get('/job-categories', getJobCategories);
router.post('/job-categories', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createJobCategory);
router.put('/job-categories/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateJobCategory);
router.delete('/job-categories/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteJobCategory);

module.exports = router;
