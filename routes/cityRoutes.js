const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getCities, createCity, updateCity, deleteCity } = require('../controllers/cityController');

router.get('/cities', getCities);
router.post('/cities', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createCity);
router.put('/cities/:id', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateCity);
router.delete('/cities/:id', protect, authorizeAdminPortal, authorize('Admin'), deleteCity);

module.exports = router;
