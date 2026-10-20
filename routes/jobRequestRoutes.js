const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const {
  getJobRequests,
  getJobRequestById,
  approveJobRequest,
  rejectJobRequest
} = require('../controllers/jobRequestController');

router.use(protect, authorizeAdminPortal);

router.get('/', getJobRequests);
router.get('/:id', getJobRequestById);
router.post('/:id/approve', approveJobRequest);
router.post('/:id/reject', rejectJobRequest);

module.exports = router;
