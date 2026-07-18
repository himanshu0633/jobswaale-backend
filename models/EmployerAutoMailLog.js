const mongoose = require('mongoose');

const EmployerAutoMailLogSchema = new mongoose.Schema({
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer',
    required: true,
    index: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  jobseeker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jobseeker',
    required: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  status: {
    type: String,
    enum: ['sent', 'skipped', 'failed'],
    default: 'sent'
  },
  reason: {
    type: String,
    default: ''
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

EmployerAutoMailLogSchema.index({ employer: 1, job: 1, jobseeker: 1 }, { unique: true });

module.exports = mongoose.model('EmployerAutoMailLog', EmployerAutoMailLogSchema);
