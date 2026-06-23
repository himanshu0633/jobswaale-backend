const express = require('express');
const router = express.Router();
const { protect, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getEmployers,
  createEmployer,
  updateEmployer,
  deleteEmployer,
  updateEmployerStatus
} = require('../controllers/employerController');

router.use(protect, authorizeAdminPortal);

router.get('/', getEmployers);
router.post('/', auditMiddleware, createEmployer);
router.put('/:id', auditMiddleware, updateEmployer);
router.delete('/:id', deleteEmployer);
router.put('/:id/status', auditMiddleware, updateEmployerStatus);

module.exports = router;
