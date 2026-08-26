const fs = require('fs');
const path = require('path');
const multer = require('multer');

const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
const uploadDir = isVercel
  ? path.join('/tmp', 'uploads', 'offers')
  : path.join(__dirname, '..', 'uploads', 'offers');

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (err) {
  console.error('Failed to create offers upload directory:', err);
}

const allowedMimeTypes = new Set(['application/pdf']);
const allowedExtensions = new Set(['.pdf']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'offer-letter';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB limit for offer letters
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(ext)) {
      return cb(new Error('Only PDF files are allowed.'));
    }
    cb(null, true);
  }
});

const uploadOfferFile = (req, res, next) => {
  upload.single('offerFile')(req, res, (error) => {
    if (!error) return next();

    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Offer letter cannot exceed 10 MB.'
      : error.message || 'Offer letter could not be uploaded.';
    return res.status(400).json({ message });
  });
};

module.exports = {
  uploadOfferFile
};
