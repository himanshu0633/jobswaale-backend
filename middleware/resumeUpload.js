const fs = require('fs');
const path = require('path');
const multer = require('multer');

const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
const uploadDir = isVercel
  ? path.join('/tmp', 'uploads', 'resumes')
  : path.join(__dirname, '..', 'uploads', 'resumes');

try {
  fs.mkdirSync(uploadDir, { recursive: true });
} catch (err) {
  console.error('Failed to create upload directory:', err);
}

const allowedMimeTypes = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
]);
const allowedExtensions = new Set(['.pdf', '.doc', '.docx']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeBase = path.basename(file.originalname, path.extname(file.originalname))
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'resume';
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedMimeTypes.has(file.mimetype) && !allowedExtensions.has(ext)) {
      return cb(new Error('Only PDF, DOC, and DOCX files are allowed.'));
    }
    cb(null, true);
  }
});

const uploadResumeFile = (req, res, next) => {
  upload.single('resume')(req, res, (error) => {
    if (!error) return next();

    const message = error.code === 'LIMIT_FILE_SIZE'
      ? 'Resume cannot exceed 5 MB.'
      : error.message || 'Resume could not be uploaded.';
    return res.status(400).json({ message });
  });
};

module.exports = {
  uploadResumeFile
};
