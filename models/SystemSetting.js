const mongoose = require('mongoose');

const SystemSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: 'global'
  },
  settings: {
    type: Object,
    default: {}
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('SystemSetting', SystemSettingSchema);
