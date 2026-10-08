const mongoose = require('mongoose');

const SkillSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  normalizedName: {
    type: String,
    required: true,
    trim: true,
    lowercase: true,
    unique: true,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active',
    index: true
  },
  usageCount: {
    type: Number,
    default: 1
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' },
  versionKey: false
});

// Composite and text indexes for rapid prefix and regex matching
SkillSchema.index({ normalizedName: 1, status: 1 });
SkillSchema.index({ usageCount: -1, name: 1 });

module.exports = mongoose.model('Skill', SkillSchema);
