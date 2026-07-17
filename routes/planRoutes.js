const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getPlans, createPlan, updatePlan, deletePlan } = require('../controllers/planController');

router.get('/plans', getPlans);
router.post('/plans', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createPlan);
router.put('/plans/:uid', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updatePlan);
router.delete('/plans/:uid', protect, authorizeAdminPortal, authorize('Admin'), deletePlan);

module.exports = router;
