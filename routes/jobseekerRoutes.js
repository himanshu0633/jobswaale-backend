const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getJobseekers,
  createJobseeker,
  updateJobseeker,
  deleteJobseeker,
  updateJobseekerStatus
} = require('../controllers/jobseekerController');

router.use(protect);

router.get('/', getJobseekers);
router.post('/', auditMiddleware, createJobseeker);
router.put('/:id', auditMiddleware, updateJobseeker);
router.delete('/:id', deleteJobseeker);
router.put('/:id/status', auditMiddleware, updateJobseekerStatus);

module.exports = router;
