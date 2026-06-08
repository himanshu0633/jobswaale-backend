const getClientIp = (req) => {
  let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.ip || '';
  if (ip.includes(',')) {
    ip = ip.split(',')[0].trim();
  }
  // Strip IPv6 prefix if present (e.g. ::ffff:)
  if (ip.startsWith('::ffff:')) {
    ip = ip.substring(7);
  }
  // Localhost resolution
  if (ip === '::1') {
    ip = '127.0.0.1';
  }
  return ip;
};

const auditMiddleware = (req, res, next) => {
  req.clientIp = getClientIp(req);
  next();
};

module.exports = { auditMiddleware, getClientIp };
