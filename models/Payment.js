const mongoose = require('mongoose');

const PaymentSchema = new mongoose.Schema({
  paymentId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  paymentDate: {
    type: Date,
    required: true
  },
  userType: {
    type: String,
    enum: ['Jobseeker', 'Employer'],
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'customerModel'
  },
  customerModel: {
    type: String,
    enum: ['Jobseeker', 'Employer']
  },
  customerName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    trim: true,
    default: ''
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  planName: {
    type: String,
    required: true,
    trim: true
  },
  planAmount: {
    type: Number,
    required: true,
    default: 0
  },
  discount: {
    type: Number,
    default: 0
  },
  paidAmount: {
    type: Number,
    required: true,
    default: 0
  },
  paymentMethod: {
    type: String,
    enum: ['Cash', 'UPI', 'Card', 'Net Banking', 'Wallet', 'Cheque'],
    required: true
  },
  paymentGateway: {
    type: String,
    enum: ['Razorpay', 'PayU', 'Cash', 'Bank'],
    required: true
  },
  gatewayTxnId: {
    type: String,
    trim: true,
    default: ''
  },
  invoiceNo: {
    type: String,
    trim: true,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['Success', 'Pending', 'Failed', 'Refunded'],
    required: true
  },
  validityType: {
    type: String,
    enum: ['One Time', 'Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Always Free'],
    required: true
  },
  validFrom: {
    type: Date,
    required: true
  },
  validTill: {
    type: Date,
    required: true
  },
  remarks: {
    type: String,
    default: ''
  },
  recordedBy: {
    type: String,
    trim: true,
    default: 'Admin'
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

module.exports = mongoose.model('Payment', PaymentSchema);
