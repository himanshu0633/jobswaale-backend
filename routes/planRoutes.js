const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getPlans, createPlan, updatePlan, deletePlan } = require('../controllers/planController');

router.use(protect, authorizeAdminPortal);
router.get('/plans', getPlans);
router.post('/plans', authorize('Admin'), auditMiddleware, createPlan);
router.put('/plans/:uid', authorize('Admin'), auditMiddleware, updatePlan);
router.delete('/plans/:uid', authorize('Admin'), deletePlan);

module.exports = router;
