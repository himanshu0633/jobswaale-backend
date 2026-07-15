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
    status: {
      type: String,
      enum: ['Scheduled', 'Completed', 'Rescheduled', 'Cancelled'],
      default: 'Scheduled'
    },
    interviewer: {
      type: String,
      default: ''
    },
    locationOrLink: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    }
  },
  selectionDetails: {
    selectedDate: {
      type: Date
    },
    interviewScore: {
      type: Number,
      default: null
    },
    offerStatus: {
      type: String,
      enum: ['Offer Sent', 'Offer Accepted', 'Offer Declined', 'Hired'],
      default: 'Offer Sent'
    },
    salaryOffered: {
      type: Number,
      default: null
    },
    joiningDate: {
      type: Date
    },
    employmentType: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    },
    offerSentAt: {
      type: Date
    },
    offerRespondedAt: {
      type: Date
    },
    hiredAt: {
      type: Date
    }
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

// Declare database indexes for fast query executions
ApplicationSchema.index({ job: 1 });
ApplicationSchema.index({ candidate: 1 });
ApplicationSchema.index({ status: 1 });

module.exports = mongoose.model('Application', ApplicationSchema);
