const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getPlanMappings, savePlanMappings } = require('../controllers/planMappingController');

router.use(protect);
router.get('/plan-mappings', getPlanMappings);
router.post('/plan-mappings', authorize('Admin'), auditMiddleware, savePlanMappings);

module.exports = router;
