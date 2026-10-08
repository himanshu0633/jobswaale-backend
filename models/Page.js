const mongoose = require('mongoose');

const PageSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  parentPage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Page',
    default: null
  },
  featuredImage: {
    type: String,
    default: ''
  },
  bannerImage: {
    type: String,
    default: ''
  },
  banners: [
    {
      url: {
        type: String,
        default: ''
      },
      position: {
        type: String,
        enum: [
          'top-left', 'top-center', 'top-right',
          'center-left', 'center', 'center-right',
          'bottom-left', 'bottom-center', 'bottom-right'
        ],
        default: 'top-center'
      },
      title: {
        type: String,
        default: ''
      },
      alt: {
        type: String,
        default: ''
      }
    }
  ],
  sortingOrder: {
    type: Number,
    default: 10
  },
  seoTitle: {
    type: String,
    default: ''
  },
  seoDescription: {
    type: String,
    default: ''
  },
  seoKeywords: {
    type: String,
    default: ''
  },
  html: {
    type: String,
    default: ''
  },
  css: {
    type: String,
    default: ''
  },
  projectData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  sections: {
    type: Array,
    default: []
  },
  published: {
    type: Boolean,
    default: false
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  ip: {
    type: String,
    default: ''
  },
  login: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
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
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

module.exports = mongoose.model('Page', PageSchema);
