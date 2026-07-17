const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getQualifications, createQualification, updateQualification, deleteQualification } = require('../controllers/qualificationController');

router.get('/qualifications', getQualifications);
router.post('/qualifications', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createQualification);
router.put('/qualifications/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateQualification);
router.delete('/qualifications/:uid', protect, authorizeAdminPortal, authorize('Admin'), deleteQualification);

module.exports = router;
