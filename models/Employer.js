const mongoose = require('mongoose');

const EmployerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
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
  phone: {
    type: String,
    required: true,
    trim: true
  },
  industryType: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'IndustryType'
  },
  website: {
    type: String,
    trim: true
  },
  description: {
    type: String
  },
  country: {
    type: String
  },
  state: {
    type: String
  },
  district: {
    type: String
  },
  city: {
    type: String
  },
  address: {
    type: String
  },
  pinCode: {
    type: String
  },
  tagline: {
    type: String,
    default: ''
  },
  foundedYear: {
    type: Number
  },
  companySize: {
    type: String,
    default: ''
  },
  gstNumber: {
    type: String,
    default: ''
  },
  profileViews: {
    type: Number,
    default: 0
  },
  rating: {
    type: Number,
    default: 4.2
  },
  socialLinks: {
    linkedin: { type: String, default: '' },
    twitter: { type: String, default: '' },
    youtube: { type: String, default: '' },
    facebook: { type: String, default: '' },
    instagram: { type: String, default: '' }
  },
  teamMembers: [{
    name: { type: String, required: true },
    role: { type: String, required: true },
    image: { type: String, default: '' },
    accessLevel: { type: String, enum: ['Owner', 'Admin', 'Member'], default: 'Member' }
  }],
  department: {
    type: String,
    default: ''
  },
  altEmail: {
    type: String,
    default: ''
  },
  bio: {
    type: String,
    default: ''
  },
  settings: {
    notifications: {
      newApplications: { type: Boolean, default: true },
      interviewReminders: { type: Boolean, default: true },
      candidateMessages: { type: Boolean, default: true },
      pipelineProgress: { type: Boolean, default: true },
      billingUpdates: { type: Boolean, default: true },
      weeklyDigest: { type: Boolean, default: false },
      appApplications: { type: Boolean, default: true },
      appReminders: { type: Boolean, default: true },
      appAnnouncements: { type: Boolean, default: true }
    },
    preferences: {
      language: { type: String, default: 'en' },
      timezone: { type: String, default: 'IST' },
      dateFormat: { type: String, default: 'DD/MM/YYYY' },
      timeFormat: { type: String, default: '12hr' },
      currency: { type: String, default: 'INR' },
      itemsPerPage: { type: String, default: '10' }
    },
    privacy: {
      showPublic: { type: Boolean, default: true },
      showPhone: { type: Boolean, default: false },
      readReceipts: { type: Boolean, default: true },
      emailSearch: { type: Boolean, default: true }
    }
  },
  currentPlan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan'
  },
  planValidity: {
    type: Date
  },
  logo: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['active', 'pending', 'blacklist'],
    default: 'active'
  },
  isVerified: {
    type: Boolean,
    default: false
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
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

// Declare database indexes for fast query executions
EmployerSchema.index({ login: 1 });
EmployerSchema.index({ status: 1 });
EmployerSchema.index({ isDeleted: 1 });

module.exports = mongoose.model('Employer', EmployerSchema);
