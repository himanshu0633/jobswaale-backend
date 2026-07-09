const express = require('express');
const router = express.Router();
const { protect, authorize, authorizeAdminPortal } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getPayments,
  getPaymentSummary,
  getPaymentCustomers,
  getPaymentById,
  createPayment,
  updatePayment,
  updatePaymentStatus,
  deletePayment
} = require('../controllers/paymentController');

router.use(protect, authorizeAdminPortal);
router.get('/summary', getPaymentSummary);
router.get('/customers', getPaymentCustomers);
router.get('/', getPayments);
router.get('/:uid', getPaymentById);
router.post('/', authorize('Admin'), auditMiddleware, createPayment);
router.put('/:uid', authorize('Admin'), auditMiddleware, updatePayment);
router.patch('/:uid/status', authorize('Admin'), auditMiddleware, updatePaymentStatus);
router.delete('/:uid', authorize('Admin'), auditMiddleware, deletePayment);

module.exports = router;
