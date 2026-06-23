const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getJobs,
  createJob,
  updateJob,
  deleteJob
} = require('../controllers/jobController');

router.use(protect, authorizeAdminPortal);

router.get('/', getJobs);
router.post('/', auditMiddleware, createJob);
router.put('/:id', auditMiddleware, updateJob);
router.delete('/:id', deleteJob);

module.exports = router;
