const fs = require('fs');
const path = require('path');
const multer = require('multer');

const createImageUpload = (folderName) => {
  const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
  const uploadDir = isVercel
    ? path.join('/tmp', 'uploads', folderName)
    : path.join(__dirname, '..', 'uploads', folderName);

  try {
    fs.mkdirSync(uploadDir, { recursive: true });
  } catch (err) {
    console.error('Failed to create upload directory:', err);
  }

  const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => {
      const safeBase = path.basename(file.originalname, path.extname(file.originalname))
        .replace(/[^a-z0-9_-]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'image';
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}-${safeBase}${ext}`);
    }
  });

  const upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const isAllowedMime = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
      const isAllowedExt = ['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext);
      if (!isAllowedMime && !isAllowedExt) {
        return cb(new Error('Only JPG, PNG, GIF, and WEBP images are allowed.'));
      }
      cb(null, true);
    }
  });

  return (fieldName) => (req, res, next) => {
    upload.single(fieldName)(req, res, (error) => {
      if (!error) return next();

      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Image cannot exceed 5 MB.'
        : error.message || 'Image could not be uploaded.';
      return res.status(400).json({ message });
    });
  };
};

module.exports = {
  createImageUpload
};
