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
  previousStatus: {
    type: String,
    default: ''
  },
  rejectedFromStatus: {
    type: String,
    default: ''
  },
  rejectedDate: {
    type: Date
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
      enum: ['Scheduled', 'On Hold', 'Completed', 'Rescheduled', 'Cancelled'],
      default: 'Scheduled'
    },
    onHold: {
      type: Boolean,
      default: false
    },
    interviewer: {
      type: String,
      default: ''
    },
    locationOrLink: {
      type: String,
      default: ''
    },
    manualAddress: {
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
      enum: ['Selected', 'Offer Sent', 'Offer Accepted', 'Offer Declined', 'Hired'],
      default: 'Selected'
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
ApplicationSchema.index({ candidate: 1, status: 1, updateDate: -1 });
ApplicationSchema.index({ job: 1, status: 1, appliedDate: -1 });
ApplicationSchema.index({ job: 1, status: 1, 'selectionDetails.offerStatus': 1, 'selectionDetails.selectedDate': -1 });
ApplicationSchema.index({ job: 1, status: 1, 'interviewDetails.status': 1, 'interviewDetails.date': -1 });

module.exports = mongoose.model('Application', ApplicationSchema);
