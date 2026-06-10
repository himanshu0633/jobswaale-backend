const activeFilter = (req) => (
  req.query.includeDeleted === 'true' ? {} : { isDeleted: { $ne: true } }
);

const isWholeNumber = (value) => {
  if (value === undefined || value === null || value === '') return true;
  return /^\d+$/.test(String(value));
};

const validateWholeNumber = (value, label = 'Sort number') => {
  if (!isWholeNumber(value)) {
    return `${label} must be a whole number.`;
  }
  return null;
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const caseInsensitiveExactFilter = (field, value, extra = {}) => ({
  ...extra,
  [field]: { $regex: `^${escapeRegex(String(value).trim())}$`, $options: 'i' }
});

module.exports = {
  activeFilter,
  validateWholeNumber,
  caseInsensitiveExactFilter
};
