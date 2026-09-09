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
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  payment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Payment'
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

EmployerResumeUnlockSchema.index({ employer: 1, candidate: 1, payment: 1 }, { unique: true, sparse: true });
EmployerResumeUnlockSchema.index({ employer: 1, plan: 1, createDate: -1 });

const EmployerResumeUnlock = mongoose.model('EmployerResumeUnlock', EmployerResumeUnlockSchema);

// Safely drop legacy indexes if they exist in MongoDB
EmployerResumeUnlock.collection?.dropIndex('employer_1_candidate_1_plan_1').catch(() => {});
EmployerResumeUnlock.collection?.dropIndex('employer_1_candidate_1_job_1_plan_1').catch(() => {});

module.exports = EmployerResumeUnlock;
