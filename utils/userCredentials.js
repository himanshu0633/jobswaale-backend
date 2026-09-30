const User = require('../models/User');
const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');

const getMobileDigits = (phone = '') => String(phone).replace(/\D/g, '');

const normalizeMobile = (phone = '') => {
  let digits = getMobileDigits(phone);
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return digits;
};

const validateMobileNumber = (phone = '') => {
  const digits = normalizeMobile(phone);
  if (!digits) {
    throw new Error('Mobile number is required');
  }
  if (!/^[6-9]\d{9}$/.test(digits)) {
    throw new Error('Please enter a valid 10-digit mobile number starting with 6, 7, 8, or 9.');
  }
  return digits;
};

const getNamePrefix = (name = '') => String(name).replace(/[^a-zA-Z]/g, '').slice(0, 4).toLowerCase();

const generatePasswordFromNameAndPhone = (name, phone) => {
  const prefix = getNamePrefix(name);
  const digits = normalizeMobile(phone);

  if (prefix.length < 4) {
    throw new Error('Name must contain at least 4 letters to generate a password');
  }

  if (digits.length < 4) {
    throw new Error('Mobile number must contain at least 4 digits to generate a password');
  }

  const maxStart = digits.length - 4;
  const start = Math.floor(Math.random() * (maxStart + 1));
  return `${prefix}${digits.slice(start, start + 4)}`;
};

const normalizeEmail = (email = '') => String(email || '').trim().toLowerCase();

const findDuplicateEmail = async (email, exclude = {}) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const userQuery = {
    email: normalizedEmail,
    isDeleted: { $ne: true }
  };
  if (exclude.userId) userQuery._id = { $ne: exclude.userId };

  return User.findOne(userQuery).select('_id email accountType role');
};

const findDuplicateMobile = async (phone, exclude = {}) => {
  const digits = getMobileDigits(phone);
  if (!digits) return null;
  const normalizedPhone = normalizeMobile(phone);

  const phoneValues = [...new Set([phone, digits, normalizedPhone].filter(Boolean))];

  const userQuery = {
    phone: { $in: phoneValues },
    isDeleted: { $ne: true }
  };
  if (exclude.userId) userQuery._id = { $ne: exclude.userId };

  const employerQuery = {
    phone: { $in: phoneValues },
    isDeleted: { $ne: true }
  };
  if (exclude.employerId) employerQuery._id = { $ne: exclude.employerId };

  const jobseekerQuery = {
    phone: { $in: phoneValues },
    isDeleted: { $ne: true }
  };
  if (exclude.jobseekerId) jobseekerQuery._id = { $ne: exclude.jobseekerId };

  const [user, employer, jobseeker] = await Promise.all([
    User.findOne(userQuery).select('_id email phone accountType'),
    Employer.findOne(employerQuery).select('_id phone companyName'),
    Jobseeker.findOne(jobseekerQuery).select('_id phone name')
  ]);

  return user || employer || jobseeker;
};

module.exports = {
  normalizeEmail,
  normalizeMobile,
  validateMobileNumber,
  generatePasswordFromNameAndPhone,
  findDuplicateEmail,
  findDuplicateMobile
};
