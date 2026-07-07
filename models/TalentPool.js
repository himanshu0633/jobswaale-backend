const mongoose = require('mongoose');

const TalentPoolSchema = new mongoose.Schema({
  employerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Jobseeker',
    required: true
  },
  category: {
    type: String,
    enum: ['High Potential', 'Technical Skills', 'Leadership Quality', 'Cultural Fit', 'Future Reference'],
    default: 'High Potential'
  },
  skills: {
    type: [String],
    default: []
  },
  note: {
    type: String,
    default: ''
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: { createdAt: 'createDate', updatedAt: 'updateDate' }
});

module.exports = mongoose.model('TalentPool', TalentPoolSchema);
