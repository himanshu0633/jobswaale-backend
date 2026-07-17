const express = require('express');
const router = express.Router();
const { protect, authorizeEmployerPortal } = require('../middleware/auth');
const { uploadMessageAttachment } = require('../middleware/messageUpload');
const { createImageUpload } = require('../middleware/imageUpload');
const {
  listEmployerMessages,
  getEmployerUnreadCount,
  getEmployerMessageThread,
  sendEmployerMessage
} = require('../controllers/messageController');
const {
  createEmployerJob,
  deleteEmployerJob,
  duplicateEmployerJob,
  getEmployerDashboard,
  getEmployerProfile,
  uploadEmployerLogo,
  updateEmployerProfile,
  getEmployerSubscription,
  selectEmployerPlan,
  getEmployerApplications,
  getEmployerApplicantHistory,
  getEmployerApplicationDetails,
  getEmployerCandidateProfile,
  getEmployerCandidates,
  getEmployerInterviews,
  getEmployerReports,
  getEmployerSelected,
  getEmployerJobForm,
  getEmployerJobDetails,
  getEmployerJobs,
  previewEmployerJob,
  updateEmployerJobAction,
  updateEmployerJob,
  updateApplicationStatus,
  updateSelectedOffer,
  scheduleApplicationInterview,
  getEmployerTalentPool,
  addEmployerTalentPool,
  removeEmployerTalentPool,
  searchEmployerTalentPoolCandidates,
  getEmployerSettings,
  updateEmployerSettings,
  submitSupportTicket
} = require('../controllers/employerDashboardController');

router.use(protect, authorizeEmployerPortal);

router.get('/dashboard', getEmployerDashboard);
router.get('/profile', getEmployerProfile);
router.post('/profile/logo', createImageUpload('employer-logos')('logo'), uploadEmployerLogo);
router.put('/profile', updateEmployerProfile);
router.get('/subscription-details', getEmployerSubscription);
router.post('/subscription/select-plan', selectEmployerPlan);
router.get('/applications', getEmployerApplications);
router.get('/applicant-history', getEmployerApplicantHistory);
router.get('/applications/:id', getEmployerApplicationDetails);
router.get('/messages', listEmployerMessages);
router.get('/messages/unread', getEmployerUnreadCount);
router.get('/messages/:applicationId', getEmployerMessageThread);
router.post('/messages/:applicationId', uploadMessageAttachment, sendEmployerMessage);
router.get('/candidateProfile/:id', getEmployerCandidateProfile);
router.get('/candidates', getEmployerCandidates);
router.get('/interviews', getEmployerInterviews);
router.get('/reports', getEmployerReports);
router.get('/selected', getEmployerSelected);
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
router.patch('/selected/:id/offer', updateSelectedOffer);

// Talent Pool routes
router.get('/talent-pool', getEmployerTalentPool);
router.post('/talent-pool', addEmployerTalentPool);
router.delete('/talent-pool/:id', removeEmployerTalentPool);
router.get('/talent-pool/search', searchEmployerTalentPoolCandidates);

// Settings routes
router.get('/settings', getEmployerSettings);
router.put('/settings', updateEmployerSettings);

// Support Ticket routes
router.post('/support/ticket', submitSupportTicket);

module.exports = router;
