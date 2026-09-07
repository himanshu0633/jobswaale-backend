const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const connectDB = require('./config/db');
const { maintenanceGuard } = require('./middleware/systemSettings');
const { initSocket } = require('./realtime/socket');

const safeDownloadName = (value, fallback) => (
  String(value || fallback)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || fallback
);

const toFileBuffer = (data) => {
  if (!data) return Buffer.alloc(0);
  if (Buffer.isBuffer(data)) return data;
  if (typeof data.value === 'function') {
    const val = data.value(true);
    return Buffer.isBuffer(val) ? val : Buffer.from(val);
  }
  if (data.buffer && (Buffer.isBuffer(data.buffer) || data.buffer instanceof ArrayBuffer)) {
    return Buffer.from(data.buffer);
  }
  if (Array.isArray(data.data)) {
    return Buffer.from(data.data);
  }
  if (typeof data === 'string') {
    return Buffer.from(data.trim().replace(/^"|"$/g, ''), 'base64');
  }
  return Buffer.from(data);
};

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

// Connect to MongoDB
connectDB().catch(err => console.error('Initial MongoDB connection failed:', err.message));

const app = express();
const server = http.createServer(app);

// Middleware
const corsOptions = {
  origin: (origin, callback) => {
    // Allow any origin dynamically
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  exposedHeaders: ['Content-Disposition', 'Content-Type', 'Content-Length', 'X-Remaining-Unlocks', 'X-Is-New-Unlock']
};

app.use(cors(corsOptions));
initSocket(server, corsOptions);
app.use(express.json({ limit: '10mb' }));

app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error('Database connection middleware error:', err);
    res.status(500).json({ message: 'Database connection error. Please try again.' });
  }
});
app.get('/uploads/messages/:filename', async (req, res, next) => {
  try {
    const Attachment = require('./models/Attachment');
    const file = await Attachment.findOne({ filename: req.params.filename });
    if (!file) {
      return next();
    }
    const fileBuffer = toFileBuffer(file.data);
    if (!fileBuffer.length) return next();
    res.setHeader('Content-Type', file.mimeType || 'application/octet-stream');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(fileBuffer);
  } catch (err) {
    console.error('Fetch attachment error:', err);
    next(err);
  }
});

app.get('/uploads/resumes/:filename', async (req, res, next) => {
  try {
    const Attachment = require('./models/Attachment');
    const file = await Attachment.findOne({ filename: req.params.filename });
    if (!file) {
      return next();
    }
    const fileBuffer = toFileBuffer(file.data);
    if (!fileBuffer.length) return next();
    res.setHeader('Content-Type', file.mimeType || 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.end(fileBuffer);
  } catch (err) {
    console.error('Fetch resume error:', err);
    next(err);
  }
});

app.get('/uploads/employer-logos/:filename', async (req, res, next) => {
  try {
    const Attachment = require('./models/Attachment');
    const file = await Attachment.findOne({ filename: req.params.filename });
    if (!file) {
      return next();
    }
    const fileBuffer = toFileBuffer(file.data);
    if (!fileBuffer.length) return next();
    res.setHeader('Content-Type', file.mimeType || 'image/png');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(fileBuffer);
  } catch (err) {
    console.error('Fetch employer logo error:', err);
    next(err);
  }
});

app.get('/uploads/offers/:filename', async (req, res, next) => {
  try {
    const Attachment = require('./models/Attachment');
    const file = await Attachment.findOne({ filename: req.params.filename });
    if (!file) {
      return next();
    }
    const fileBuffer = toFileBuffer(file.data);
    if (!fileBuffer.length) return next();
    res.setHeader('Content-Type', file.mimeType || 'application/pdf');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('Content-Disposition', `attachment; filename="${safeDownloadName(file.originalName || req.params.filename, 'offer-letter.pdf')}"`);
    return res.end(fileBuffer);
  } catch (err) {
    console.error('Fetch offer letter error:', err);
    next(err);
  }
});

app.get('/uploads/employer-banners/:filename', async (req, res, next) => {
  try {
    const Attachment = require('./models/Attachment');
    const file = await Attachment.findOne({ filename: req.params.filename });
    if (!file) {
      return next();
    }
    const fileBuffer = toFileBuffer(file.data);
    if (!fileBuffer.length) return next();
    res.setHeader('Content-Type', file.mimeType || 'image/png');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.end(fileBuffer);
  } catch (err) {
    console.error('Fetch employer banner error:', err);
    next(err);
  }
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
if (isVercel) {
  app.use('/uploads', express.static(path.join('/tmp', 'uploads')));
}
app.use(maintenanceGuard);

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/settings', require('./routes/settingsRoutes'));
app.use('/api/admin', require('./routes/adminRoutes'));
app.use('/api/masters', require('./routes/dashboardRoutes'));
app.use('/api/masters', require('./routes/countryRoutes'));
app.use('/api/masters', require('./routes/stateRoutes'));
app.use('/api/masters', require('./routes/districtRoutes'));
app.use('/api/masters', require('./routes/cityRoutes'));
app.use('/api/masters', require('./routes/industryRoutes'));
app.use('/api/masters', require('./routes/jobCategoryRoutes'));
app.use('/api/masters', require('./routes/jobTypeRoutes'));
app.use('/api/masters', require('./routes/featureRoutes'));
app.use('/api/masters', require('./routes/planRoutes'));
app.use('/api/masters', require('./routes/qualificationRoutes'));
app.use('/api/masters', require('./routes/planMappingRoutes'));
app.use('/api/cms', require('./routes/pageRoutes'));
app.use('/api/cms', require('./routes/blogCategoryRoutes'));
app.use('/api/cms', require('./routes/blogRoutes'));
app.use('/api/employers', require('./routes/employerRoutes'));
app.use('/api/employer', require('./routes/employerPortalRoutes'));
app.use('/api/jobseekers', require('./routes/jobseekerRoutes'));
app.use('/api/jobseeker', require('./routes/jobseekerPortalRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/payments', require('./routes/transactionRoutes'));
app.use('/api/reports', require('./routes/reportRoutes'));
app.use('/api/cron', require('./routes/cronRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));


// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to JobsWaale API Portal' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', {
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method
  });

  res.status(err.status || 500).json({
    message: err.message || 'Something went wrong on the server'
  });
});

const PORT = process.env.PORT || 5000;

if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });
}

module.exports = app;
