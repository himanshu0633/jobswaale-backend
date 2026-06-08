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
  cost: {
    type: Number,
    required: true,
    default: 0
  },
  planValidity: {
    type: String,
    enum: ['One Time', 'Monthly', 'Quarterly', 'Half-Yearly', 'Yearly', 'Always Free'],
    required: true
  },
  startingDate: {
    type: Date
  },
  endDate: {
    type: Date
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
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('Plan', PlanSchema);
