const express = require('express');
const router = express.Router();
const { protect, authorizeEmployerPortal } = require('../middleware/auth');
const {
  createEmployerJob,
  deleteEmployerJob,
  duplicateEmployerJob,
  getEmployerDashboard,
  getEmployerProfile,
  getEmployerApplications,
  getEmployerCandidates,
  getEmployerJobForm,
  getEmployerJobDetails,
  getEmployerJobs,
  previewEmployerJob,
  updateEmployerJobAction,
  updateEmployerJob,
  updateApplicationStatus,
  scheduleApplicationInterview
} = require('../controllers/employerDashboardController');

router.use(protect, authorizeEmployerPortal);

router.get('/dashboard', getEmployerDashboard);
router.get('/profile', getEmployerProfile);
router.get('/applications', getEmployerApplications);
router.get('/candidates', getEmployerCandidates);
router.get('/job-form', getEmployerJobForm);
router.get('/jobs', getEmployerJobs);
router.get('/jobs/:id', getEmployerJobDetails);
router.post('/jobs/preview', previewEmployerJob);
router.post('/jobs/:id/duplicate', duplicateEmployerJob);
router.post('/jobs', createEmployerJob);
router.patch('/jobs/:id/action', updateEmployerJobAction);
router.put('/jobs/:id', updateEmployerJob);
router.delete('/jobs/:id', deleteEmployerJob);

// Application actions
router.patch('/applications/:id/status', updateApplicationStatus);
router.post('/applications/:id/schedule-interview', scheduleApplicationInterview);

module.exports = router;
