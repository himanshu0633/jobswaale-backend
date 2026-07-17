const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  employer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jobseeker',
    required: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['employer', 'jobseeker'],
    required: true
  },
  body: {
    type: String,
    trim: true,
    maxlength: 2000,
    default: ''
  },
  attachment: {
    url: { type: String, trim: true, default: '' },
    originalName: { type: String, trim: true, default: '' },
    mimeType: { type: String, trim: true, default: '' },
    size: { type: Number, default: 0 },
    fileType: {
      type: String,
      enum: ['', 'image', 'document'],
      default: ''
    }
  },
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',
    default: null
  },
  readAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

MessageSchema.index({ application: 1, createDate: 1 });
MessageSchema.index({ employer: 1, createDate: -1 });
MessageSchema.index({ candidate: 1, createDate: -1 });
MessageSchema.index({ job: 1, createDate: -1 });
MessageSchema.index({ replyTo: 1 });

module.exports = mongoose.model('Message', MessageSchema);
