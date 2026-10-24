const mongoose = require('mongoose');

const JobCategorySchema = new mongoose.Schema({
  id: {
    type: String,
    unique: true,
    sparse: true
  },
  categoryName: {
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
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  },
  isRequested: {
    type: Boolean,
    default: false
  },
  requestedBy: {
    type: String,
    default: ''
  },
  requestedRole: {
    type: String,
    default: ''
  },
  ip: {
    type: String,
    default: ''
  },
  login: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
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

module.exports = mongoose.model('JobCategory', JobCategorySchema);
