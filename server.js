const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const connectDB = require('./config/db');
const { maintenanceGuard } = require('./middleware/systemSettings');
const { initSocket } = require('./realtime/socket');

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
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept']
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
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(file.data);
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
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'private, max-age=3600');
    return res.send(file.data);
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
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('Content-Length', file.size);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    return res.send(file.data);
  } catch (err) {
    console.error('Fetch employer logo error:', err);
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


// TEMPORARY DATABASE CLEANUP ENDPOINT
app.get('/api/temp-db-cleanup', async (req, res) => {
  try {
    const Application = require('./models/Application');
    const EmployerResumeUnlock = require('./models/EmployerResumeUnlock');
    const Message = require('./models/Message');
    const Notification = require('./models/Notification');

    // 1. Reset all application statuses to 'Applied'
    const appResult = await Application.updateMany(
      {},
      {
        $set: {
          status: 'Applied',
          previousStatus: '',
          rejectedFromStatus: '',
          matchScore: 0
        },
        $unset: {
          rejectedDate: '',
          shortlistedDate: '',
          interviewDetails: '',
          selectionDetails: ''
        }
      }
    );

    // 2. Remove all resume unlocks
    const unlockResult = await EmployerResumeUnlock.deleteMany({});

    // 3. Remove all chat messages
    const messageResult = await Message.deleteMany({});

    // 4. Remove all notifications
    const notifResult = await Notification.deleteMany({});

    res.json({
      success: true,
      message: 'Database cleanup completed successfully on production!',
      details: {
        applicationsModified: appResult.modifiedCount,
        unlocksDeleted: unlockResult.deletedCount,
        messagesDeleted: messageResult.deletedCount,
        notificationsDeleted: notifResult.deletedCount
      }
    });
  } catch (err) {
    console.error('Temp Cleanup Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

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
