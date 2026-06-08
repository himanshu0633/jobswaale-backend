const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getEmployers,
  createEmployer,
  updateEmployer,
  deleteEmployer,
  updateEmployerStatus
} = require('../controllers/employerController');

router.use(protect);

router.get('/', getEmployers);
router.post('/', auditMiddleware, createEmployer);
router.put('/:id', auditMiddleware, updateEmployer);
router.delete('/:id', deleteEmployer);
router.put('/:id/status', auditMiddleware, updateEmployerStatus);

module.exports = router;
