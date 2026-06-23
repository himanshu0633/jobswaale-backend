const mongoose = require('mongoose');

const PlanSchema = new mongoose.Schema({
  category: {
    type: String,
    enum: ['Jobseeker', 'Employer'],
    required: true
  },
  planName: {
    type: String,
    required: true,
    trim: true
  },
  planSubtitle: {
    type: String,
    trim: true,
    default: ''
  },
  cost: {
    type: Number,
    required: true,
    default: 0
  },
  planValidity: {
    type: String,
    enum: ['One Time', 'Weekly', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Always Free'],
    required: true
  },
  startingDate: {
    type: Date
  },
  endDate: {
    type: Date
  },
  planType: {
    type: String,
    enum: ['Free', 'Paid'],
    default: 'Free'
  },
  displayOrder: {
    type: Number,
    default: 0
  },
  unlockCount: {
    type: String,
    trim: true,
    default: ''
  },
  freeJobPosts: {
    type: Number,
    default: 0
  },
  showBadge: {
    type: Boolean,
    default: false
  },
  badge: {
    type: String,
    trim: true,
    default: ''
  },
  employerFeatures: [{
    type: String,
    trim: true
  }],
  offerEnabled: {
    type: Boolean,
    default: false
  },
  offerTitle: {
    type: String,
    trim: true,
    default: ''
  },
  offerDescription: {
    type: String,
    trim: true,
    default: ''
  },
  features: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feature'
  }],
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
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

module.exports = mongoose.model('Plan', PlanSchema);
