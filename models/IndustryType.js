const mongoose = require('mongoose');

const IndustryTypeSchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    required: true
  },
  industryType: {
    type: String,
    required: true,
    trim: true
  },
  sortingNo: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  ip: {
    type: String,
    default: ''
  },
  login: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedLogin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('IndustryType', IndustryTypeSchema);
