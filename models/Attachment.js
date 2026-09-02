const mongoose = require('mongoose');

const AttachmentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  data: {
    type: Buffer,
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  originalName: {
    type: String,
    trim: true,
    default: ''
  },
  size: {
    type: Number,
    required: true
  },
  createDate: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Attachment', AttachmentSchema);
