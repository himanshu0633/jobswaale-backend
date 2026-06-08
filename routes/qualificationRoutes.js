const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getQualifications, createQualification, updateQualification, deleteQualification } = require('../controllers/qualificationController');

router.use(protect);
router.get('/qualifications', getQualifications);
router.post('/qualifications', authorize('Admin'), auditMiddleware, createQualification);
router.put('/qualifications/:uid', authorize('Admin'), auditMiddleware, updateQualification);
router.delete('/qualifications/:uid', authorize('Admin'), deleteQualification);

module.exports = router;
