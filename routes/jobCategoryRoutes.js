const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getJobCategories, createJobCategory, updateJobCategory, deleteJobCategory } = require('../controllers/jobCategoryController');

router.use(protect);
router.get('/job-categories', getJobCategories);
router.post('/job-categories', authorize('Admin'), auditMiddleware, createJobCategory);
router.put('/job-categories/:uid', authorize('Admin'), auditMiddleware, updateJobCategory);
router.delete('/job-categories/:uid', authorize('Admin'), deleteJobCategory);

module.exports = router;
