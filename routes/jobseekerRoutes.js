const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getJobseekers,
  getJobseekerApplicationHistory,
  createJobseeker,
  updateJobseeker,
  deleteJobseeker,
  updateJobseekerStatus
} = require('../controllers/jobseekerController');

router.use(protect, authorizeAdminPortal);

router.get('/', getJobseekers);
router.get('/:id/applications', getJobseekerApplicationHistory);
router.post('/', auditMiddleware, createJobseeker);
router.put('/:id', auditMiddleware, updateJobseeker);
router.delete('/:id', deleteJobseeker);
router.put('/:id/status', auditMiddleware, updateJobseekerStatus);

module.exports = router;
