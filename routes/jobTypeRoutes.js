const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getJobTypes, createJobType, updateJobType, deleteJobType } = require('../controllers/jobTypeController');

router.use(protect);
router.get('/job-types', getJobTypes);
router.post('/job-types', authorize('Admin'), auditMiddleware, createJobType);
router.put('/job-types/:uid', authorize('Admin'), auditMiddleware, updateJobType);
router.delete('/job-types/:uid', authorize('Admin'), deleteJobType);

module.exports = router;
