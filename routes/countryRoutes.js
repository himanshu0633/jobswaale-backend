const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getCountries, createCountry, updateCountry, deleteCountry } = require('../controllers/countryController');

router.get('/countries', getCountries);
router.post('/countries', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, createCountry);
router.put('/countries/:id', protect, authorizeAdminPortal, authorize('Admin'), auditMiddleware, updateCountry);
router.delete('/countries/:id', protect, authorizeAdminPortal, authorize('Admin'), deleteCountry);

module.exports = router;
