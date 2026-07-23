const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { getNotifications, markAsSeen, markAllSeen } = require('../controllers/notificationController');

router.use(protect);

router.get('/', getNotifications);
router.put('/seen-all', markAllSeen);
router.put('/:id/seen', markAsSeen);

module.exports = router;
