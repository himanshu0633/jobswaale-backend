const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getTransactions } = require('../controllers/transactionController');

router.use(protect);
router.get('/transactions', getTransactions);

module.exports = router;
