const mongoose = require('mongoose');

const JobEditRequestSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  employerProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer'
  },
  jobTitle: {
    type: String,
    required: true,
    trim: true
  },
  companyName: {
    type: String,
    trim: true,
    default: ''
  },
  planName: {
    type: String,
    trim: true,
    default: 'Standard'
  },
  // Snapshot of job data prior to the edit
  previousData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // New proposed data submitted by employer
  proposedData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Array of field names that were changed (e.g., ['jobTitle', 'salary', 'vacancies'])
  changedFields: [{
    type: String,
    trim: true
  }],
  status: {
    type: String,
    enum: ['pending', 'viewed', 'approved', 'rejected'],
    default: 'pending',
    index: true
  },
  isViewed: {
    type: Boolean,
    default: false
  },
  viewedAt: {
    type: Date
  },
  rejectionReason: {
    type: String,
    default: ''
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('JobEditRequest', JobEditRequestSchema);
