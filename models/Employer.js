const mongoose = require('mongoose');

const EmployerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  industryType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndustryType',
    required: true
  },
  website: {
    type: String,
    trim: true
  },
  description: {
    type: String
  },
  country: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  district: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  address: {
    type: String,
    required: true
  },
  pinCode: {
    type: String,
    required: true
  },
  currentPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  planValidity: {
    type: Date
  },
  logo: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'blacklist'],
    default: 'active'
  },
  isVerified: {
    type: Boolean,
    default: false
  },
  blacklistReason: {
    type: String,
    default: ''
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

module.exports = mongoose.model('Employer', EmployerSchema);
