const mongoose = require('mongoose');

const JobSchema = new mongoose.Schema({
  postingDate: {
    type: Date,
    default: Date.now
  },
  jobTitle: {
    type: String,
    required: true,
    trim: true
  },
  jobCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCategory',
    required: true
  },
  jobType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobType',
    required: true
  },
  vacancies: {
    type: Number,
    required: true
  },
  workMode: {
    type: String,
    enum: ['Onsite', 'Remote'],
    default: 'Onsite'
  },
  description: {
    type: String,
    required: true
  },
  qualification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Qualification'
  },
  experience: {
    type: String,
    required: true
  },
  salary: {
    type: String
  },
  salaryNegotiable: {
    type: Boolean,
    default: false
  },
  country: {
    type: String,
    required: true
  },
  state: {
    type: String,
    required: true
  },
  district: {
    type: String,
    required: true
  },
  city: {
    type: String,
    required: true
  },
  companyName: {
    type: String,
    required: true,
    trim: true
  },
  contactPerson: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    trim: true
  },
  currentPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  planValidity: {
    type: Date
  },
  document: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'closed'],
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

module.exports = mongoose.model('Job', JobSchema);
