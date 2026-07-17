const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getJobTypes, createJobType, updateJobType, deleteJobType } = require('../controllers/jobTypeController');

router.get('/job-types', getJobTypes);
router.post('/job-types', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createJobType);
router.put('/job-types/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateJobType);
router.delete('/job-types/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteJobType);

module.exports = router;
