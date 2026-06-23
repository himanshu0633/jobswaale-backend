const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const { getTransactions } = require('../controllers/transactionController');

router.use(protect, authorizeAdminPortal);
router.get('/transactions', getTransactions);

module.exports = router;
