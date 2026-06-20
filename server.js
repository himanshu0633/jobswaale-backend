const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');

// Load environment variables
dotenv.config();

// Connect to MongoDB
connectDB();

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
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
app.use('/api/cms', require('./routes/headerRoutes'));
app.use('/api/employers', require('./routes/employerRoutes'));
app.use('/api/jobseekers', require('./routes/jobseekerRoutes'));
app.use('/api/jobs', require('./routes/jobRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));

// Root endpoint
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to JobsWaale API Portal' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ message: 'Something went wrong on the server', error: err.message });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

module.exports = app;
