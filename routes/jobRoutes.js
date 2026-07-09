const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getJobs,
  getJobById,
  applyJob,
  createJob,
  updateJob,
  deleteJob
} = require('../controllers/jobController');

// Public route to view details of a job
router.get('/:id', getJobById);

// Route for jobseekers to apply for a job
router.post('/:id/apply', protect, applyJob);

// Public route to list all active jobs
router.get('/', getJobs);

// Admin-only operations below
router.use(protect, authorizeAdminPortal);

router.post('/', auditMiddleware, createJob);
router.put('/:id', auditMiddleware, updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
