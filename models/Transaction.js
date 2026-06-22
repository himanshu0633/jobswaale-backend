const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  txnId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  txnDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  type: {
    type: String,
    enum: ['Credit', 'Debit'],
    required: true
  },
  category: {
    type: String,
    enum: ['Plan Purchase', 'Refund', 'Adjustment', 'Manual Entry'],
    required: true
  },
  paymentRef: {
    type: String,
    default: '—'
  },
  userType: {
    type: String,
    enum: ['Employer', 'Jobseeker'],
    required: true
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    default: 0
  },
  description: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Success', 'Pending', 'Failed'],
    default: 'Success',
    required: true
  },
  ip: {
    type: String,
    default: ''
  },
  login: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedLogin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('Transaction', TransactionSchema);
