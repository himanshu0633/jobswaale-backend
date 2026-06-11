const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getHeader, getPublicHeader, saveHeader } = require('../controllers/headerController');

router.get('/public/header', getPublicHeader);

router.get('/header', protect, getHeader);
router.put('/header', protect, authorize('Admin'), auditMiddleware, saveHeader);

module.exports = router;
