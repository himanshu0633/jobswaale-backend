const express = require('express');
const router = express.Router();
const { checkPlanExpiries } = require('../controllers/cronController');

router.get('/check-expiry', checkPlanExpiries);

module.exports = router;
