const mongoose = require('mongoose');

const PlanMappingSchema = new mongoose.Schema({
  plan: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Plan',
    required: true
  },
  feature: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Feature',
    required: true
  },
  value: {
    type: String,
    enum: ['Yes', 'No', 'Limited', 'Unlimited', '3 Months'],
    default: 'No'
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
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

// Unique index to ensure each feature is only mapped once per plan
PlanMappingSchema.index({ plan: 1, feature: 1 }, { unique: true });

module.exports = mongoose.model('PlanMapping', PlanMappingSchema);
