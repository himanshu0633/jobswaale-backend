const mongoose = require('mongoose');

const SupportTicketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  ticketId: {
    type: String,
    unique: true,
    sparse: true
  },
  email: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    default: 'General'
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  priority: {
    type: String,
    enum: ['Low', 'Medium', 'High', 'Urgent'],
    default: 'Medium'
  },
  message: {
    type: String,
    required: true
  },
  attachment: {
    type: String,
    default: ''
  },
  attachmentOriginalName: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['open', 'in-progress', 'resolved', 'closed'],
    default: 'open'
  },
  responses: [
    {
      sender: {
        type: String,
        enum: ['user', 'admin'],
        default: 'user'
      },
      senderName: {
        type: String,
        default: ''
      },
      message: {
        type: String,
        required: true
      },
      attachment: {
        type: String,
        default: ''
      },
      createdAt: {
        type: Date,
        default: Date.now
      }
    }
  ],
  adminReply: {
    type: String,
    default: ''
  },
  adminReplyAt: {
    type: Date
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

SupportTicketSchema.pre('save', function(next) {
  if (!this.ticketId) {
    this.ticketId = `TICK-${Math.floor(100000 + Math.random() * 900000)}`;
  }
  next();
});

module.exports = mongoose.model('SupportTicket', SupportTicketSchema);

