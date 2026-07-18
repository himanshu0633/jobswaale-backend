const mongoose = require('mongoose');

const JobseekerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  phone: {
    type: String,
    default: '',
    trim: true
  },
  gender: {
    type: String,
    enum: ['', 'Male', 'Female', 'Other'],
    default: ''
  },
  qualification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Qualification',
    default: null
  },
  industryType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndustryType'
  },
  jobCategory: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobCategory'
  },
  jobType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobType'
  },
  experience: {
    type: String,
    default: ''
  },
  expectedSalary: {
    type: String
  },
  preferredLocation: {
    type: String
  },
  country: {
    type: String,
    default: ''
  },
  state: {
    type: String,
    default: ''
  },
  district: {
    type: String,
    default: ''
  },
  city: {
    type: String,
    default: ''
  },
  address: {
    type: String,
    default: ''
  },
  pinCode: {
    type: String,
    default: ''
  },
  currentPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  planValidity: {
    type: Date
  },
  resume: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'blacklist'],
    default: 'active'
  },
  jobSearchStatus: {
    type: String,
    enum: ['looking', 'not-looking'],
    default: 'looking'
  },
  blacklistReason: {
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
    required: true
  },
  updatedLogin: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  dob: {
    type: String,
    default: ''
  },
  designation: {
    type: String,
    default: ''
  },
  relocate: {
    type: String,
    enum: ['yes', 'no'],
    default: 'yes'
  },
  bio: {
    type: String,
    default: ''
  },
  passingYear: {
    type: String,
    default: ''
  },
  studyField: {
    type: String,
    default: ''
  },
  university: {
    type: String,
    default: ''
  },
  skills: {
    type: [String],
    default: []
  },
  linkedin: {
    type: String,
    default: ''
  },
  portfolio: {
    type: String,
    default: ''
  },
  github: {
    type: String,
    default: ''
  },
  savedJobs: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  }],
  savedEmployers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Employer'
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('Jobseeker', JobseekerSchema);
