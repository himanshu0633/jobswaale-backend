const mongoose = require('mongoose');

const EmployerAutoMailSettingSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer',
    required: true,
    unique: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  currentPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  enabled: {
    type: Boolean,
    default: false
  },
  limit: {
    type: Number,
    default: 0
  },
  used: {
    type: Number,
    default: 0
  },
  perJobLimit: {
    type: Number,
    default: 10
  },
  activeOnly: {
    type: Boolean,
    default: true
  },
  includeCurrentLocation: {
    type: Boolean,
    default: true
  },
  includePreferredLocation: {
    type: Boolean,
    default: true
  },
  includeAppliedLocation: {
    type: Boolean,
    default: false
  },
  locations: [{
    type: String,
    trim: true
  }],
  minExperience: {
    type: Number,
    default: null
  },
  maxExperience: {
    type: Number,
    default: null
  },
  lastSentAt: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

EmployerAutoMailSettingSchema.index({ employer: 1 });
EmployerAutoMailSettingSchema.index({ currentPlan: 1 });

module.exports = mongoose.model('EmployerAutoMailSetting', EmployerAutoMailSettingSchema);
