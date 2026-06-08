const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { getDashboardStats } = require('../controllers/dashboardController');

router.get('/dashboard/stats', protect, authorize('Admin'), getDashboardStats);

module.exports = router;
