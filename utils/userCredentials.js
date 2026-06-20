const User = require('../models/User');
const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');

const getMobileDigits = (phone = '') => String(phone).replace(/\D/g, '');

const normalizeMobile = (phone = '') => {
  const digits = getMobileDigits(phone);
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const validateMobileNumber = (phone = '') => {
  const digits = getMobileDigits(phone);
  if (digits.length < 10) {
    throw new Error('Mobile number must contain at least 10 digits');
  }
  if (digits.length > 15) {
    throw new Error('Mobile number cannot contain more than 15 digits including country code');
  }
  return normalizeMobile(phone);
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
  normalizeMobile,
  validateMobileNumber,
  generatePasswordFromNameAndPhone,
  findDuplicateMobile
};
