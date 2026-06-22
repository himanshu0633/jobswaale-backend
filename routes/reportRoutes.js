const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const reportController = require('../controllers/reportController');

// All report routes require user authentication and admin portal authorization
router.use(protect, authorizeAdminPortal);

router.get('/jobs', reportController.getJobReports);
router.get('/applications', reportController.getApplicationReports);
router.get('/candidates', reportController.getCandidateReports);
router.get('/employers', reportController.getEmployerReports);
router.get('/finance', reportController.getFinanceReports);

module.exports = router;
