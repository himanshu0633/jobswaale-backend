const addAuditOnCreate = (req, body = {}) => {
  return {
    ...body,
    ip: req.clientIp || '127.0.0.1',
    login: req.user ? req.user._id : null
  };
};

const addAuditOnUpdate = (req, body = {}) => {
  return {
    ...body,
    ip: req.clientIp || '127.0.0.1',
    updatedLogin: req.user ? req.user._id : null
  };
};

module.exports = {
  addAuditOnCreate,
  addAuditOnUpdate
};
