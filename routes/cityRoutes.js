const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const { getCities, createCity, updateCity, deleteCity } = require('../controllers/cityController');

router.use(protect);
router.get('/cities', getCities);
router.post('/cities', authorize('Admin'), auditMiddleware, createCity);
router.put('/cities/:id', authorize('Admin'), auditMiddleware, updateCity);
router.delete('/cities/:id', authorize('Admin'), deleteCity);

module.exports = router;
