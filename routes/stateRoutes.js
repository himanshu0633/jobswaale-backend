const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getStates, createState, updateState, deleteState } = require('../controllers/stateController');

router.use(protect);
router.get('/states', getStates);
router.post('/states', authorize('Admin'), auditMiddleware, createState);
router.put('/states/:id', authorize('Admin'), auditMiddleware, updateState);
router.delete('/states/:id', authorize('Admin'), deleteState);

module.exports = router;
