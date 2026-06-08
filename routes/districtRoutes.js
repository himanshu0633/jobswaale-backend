const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getDistricts, createDistrict, updateDistrict, deleteDistrict } = require('../controllers/districtController');

router.use(protect);
router.get('/districts', getDistricts);
router.post('/districts', authorize('Admin'), auditMiddleware, createDistrict);
router.put('/districts/:id', authorize('Admin'), auditMiddleware, updateDistrict);
router.delete('/districts/:id', authorize('Admin'), deleteDistrict);

module.exports = router;
