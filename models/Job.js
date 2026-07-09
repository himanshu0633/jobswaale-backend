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
    enum: ['Onsite', 'Remote', 'Office', 'Work from Home', 'Hybrid'],
    default: 'Onsite'
  },
  jobLocations: [{
    type: String,
    trim: true
  }],
  description: {
    type: String,
    required: true
  },
  jobSummary: {
    type: String,
    trim: true,
    default: ''
  },
  detailedDescription: {
    type: String,
    default: ''
  },
  responsibilities: {
    type: String,
    default: ''
  },
  qualification: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Qualification'
  },
  experience: {
    type: String,
    required: true
  },
  requiredExperience: {
    type: String,
    trim: true,
    default: ''
  },
  salary: {
    type: String
  },
  minSalary: {
    type: Number,
    default: null
  },
  maxSalary: {
    type: Number,
    default: null
  },
  salaryUnit: {
    type: String,
    trim: true,
    default: ''
  },
  salaryNegotiable: {
    type: Boolean,
    default: false
  },
  noticePeriod: {
    type: String,
    trim: true,
    default: ''
  },
  joiningDate: {
    type: Date
  },
  shiftTiming: {
    type: String,
    trim: true,
    default: ''
  },
  jobExpiry: {
    type: Date
  },
  benefits: {
    type: String,
    default: ''
  },
  aboutCompany: {
    type: String,
    default: ''
  },
  skills: [{
    type: String,
    trim: true
  }],
  languages: [{
    type: String,
    trim: true
  }],
  candidateLocationPreference: {
    type: String,
    trim: true,
    default: ''
  },
  screeningQuestions: {
    type: String,
    default: ''
  },
  publishStatus: {
    type: String,
    enum: ['publish', 'draft', 'scheduled'],
    default: 'publish'
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
    enum: ['active', 'inactive', 'closed', 'pending', 'reviewed', 'featured', 'blacklist'],
    default: 'active'
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
  },
  slug: {
    type: String,
    unique: true,
    sparse: true
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

JobSchema.pre('save', function () {
  if (this.isModified('jobTitle') || this.isModified('companyName') || !this.slug) {
    const base = `${this.jobTitle || 'job'}-${this.companyName || 'company'}`;
    const baseSlug = slugify(base);
    const uniqueSuffix = String(this._id).slice(-6);
    this.slug = `${baseSlug}-${uniqueSuffix}`;
  }
});

module.exports = mongoose.model('Job', JobSchema);
