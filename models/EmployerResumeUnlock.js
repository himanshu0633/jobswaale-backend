const mongoose = require('mongoose');

const EmployerResumeUnlockSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer',
    required: true
  },
  login: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jobseeker',
    required: true
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  ip: {
    type: String,
    default: ''
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

EmployerResumeUnlockSchema.index({ employer: 1, candidate: 1, plan: 1 }, { unique: true });

module.exports = mongoose.model('EmployerResumeUnlock', EmployerResumeUnlockSchema);
