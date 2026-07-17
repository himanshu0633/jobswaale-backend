const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getStates, createState, updateState, deleteState } = require('../controllers/stateController');

router.get('/states', getStates);
router.post('/states', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createState);
router.put('/states/:id', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateState);
router.delete('/states/:id', protect, authorizeAdminPortal, authorize('Admin'), deleteState);

module.exports = router;
