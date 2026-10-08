const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getSkills, createSkill } = require('../controllers/skillController');

// Optional auth so req.user is set if provided, but does not block requests
const optionalAuth = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
      req.user = await User.findById(decoded.id).select('-password');
    } catch (e) {
      // Continue without user
    }
  }
  next();
};

router.get('/', getSkills);
router.post('/', optionalAuth, createSkill);

module.exports = router;
