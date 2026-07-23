const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  message: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['plan_expiry', 'job_posted', 'candidate_applied', 'application_status', 'job_alert', 'general'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['unseen', 'seen'],
    default: 'unseen'
  },
  redirectUrl: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

NotificationSchema.index({ recipient: 1, status: 1, createDate: -1 });

module.exports = mongoose.model('Notification', NotificationSchema);
