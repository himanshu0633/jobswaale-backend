const mongoose = require('mongoose');

const MenuSchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true
  },
  path: {
    type: String,
    default: '',
    trim: true
  },
  order: {
    type: Number,
    default: 0
  },
  visible: {
    type: Boolean,
    default: true
  },
  children: []
}, { _id: true });

MenuSchema.add({ children: [MenuSchema] });

const HeaderSchema = new mongoose.Schema({
  logo: {
    type: String,
    default: ''
  },
  menus: {
    type: [MenuSchema],
    default: []
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
  }
}, {
  timestamps: { createdAt: 'createdAt', updatedAt: 'updatedAt' }
});

module.exports = mongoose.model('Header', HeaderSchema);
