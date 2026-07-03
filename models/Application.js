const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jobseeker',
    required: true
  },
  status: {
    type: String,
    enum: ['Applied', 'Shortlisted', 'Interview', 'Reviewed', 'Rejected', 'Offered'],
    default: 'Applied'
  },
  matchScore: {
    type: Number,
    default: 0
  },
  appliedDate: {
    type: Date,
    default: Date.now
  },
  shortlistedDate: {
    type: Date
  },
  interviewDetails: {
    date: {
      type: Date
    },
    time: {
      type: String
    },
    type: {
      type: String,
      enum: ['Video Call', 'Phone Call', 'In-Person', 'Other']
    },
    locationOrLink: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    }
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('Application', ApplicationSchema);
