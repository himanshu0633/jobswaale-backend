const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { uploadMessageAttachment } = require('../middleware/messageUpload');
const {
  listJobseekerMessages,
  getJobseekerUnreadCount,
  getJobseekerMessageThread,
  sendJobseekerMessage
} = require('../controllers/messageController');
const {
  getJobseekerDashboard,
  getJobseekerProfile,
  updateJobseekerProfile,
  getJobseekerSubscription,
  selectJobseekerPlan,
  getJobseekerApplications,
  getJobseekerSavedJobs,
  toggleSaveJob,
  getJobseekerSavedEmployers,
  toggleSaveEmployer
} = require('../controllers/jobseekerDashboardController');

// Middleware to ensure the user is a Jobseeker
const authorizeJobseeker = (req, res, next) => {
  const role = String(req.user?.role || '').trim().toLowerCase();
  const accountType = String(req.user?.accountType || '').trim().toLowerCase();

  if (role !== 'jobseeker' && accountType !== 'jobseeker') {
    return res.status(403).json({ message: 'Jobseeker access is required' });
  }
  next();
};

router.use(protect, authorizeJobseeker);

router.get('/dashboard', getJobseekerDashboard);
router.get('/profile', getJobseekerProfile);
router.put('/profile', updateJobseekerProfile);
router.get('/subscription', getJobseekerSubscription);
router.post('/subscription/select-plan', selectJobseekerPlan);
router.get('/applications', getJobseekerApplications);
router.get('/messages', listJobseekerMessages);
router.get('/messages/unread', getJobseekerUnreadCount);
router.get('/messages/:applicationId', getJobseekerMessageThread);
router.post('/messages/:applicationId', uploadMessageAttachment, sendJobseekerMessage);
router.get('/saved-jobs', getJobseekerSavedJobs);
router.post('/saved-jobs/:jobId/toggle', toggleSaveJob);
router.get('/saved-employers', getJobseekerSavedEmployers);
router.post('/saved-employers/:employerId/toggle', toggleSaveEmployer);

module.exports = router;
