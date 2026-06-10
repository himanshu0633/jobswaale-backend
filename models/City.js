const mongoose = require('mongoose');

const CitySchema = new mongoose.Schema({
  cid: {
    type: String,
    required: true
  },
  sid: {
    type: String,
    required: true
  },
  did: {
    type: String,
    required: true
  },
  ctid: {
    type: String,
    unique: true,
    required: true
  },
  cityName: {
    type: String,
    required: true,
    trim: true
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

module.exports = mongoose.model('City', CitySchema);
