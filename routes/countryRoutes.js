const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getCountries, createCountry, updateCountry, deleteCountry } = require('../controllers/countryController');

router.use(protect, authorizeAdminPortal);
router.get('/countries', getCountries);
router.post('/countries', authorize('Admin'), auditMiddleware, createCountry);
router.put('/countries/:id', authorize('Admin'), auditMiddleware, updateCountry);
router.delete('/countries/:id', authorize('Admin'), deleteCountry);

module.exports = router;
