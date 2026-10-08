const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/jobswaale';

  if (mongoose.connection.readyState >= 1) {
    return;
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS) || 10000,
      connectTimeoutMS: Number(process.env.MONGO_CONNECT_TIMEOUT_MS) || 10000,
      socketTimeoutMS: Number(process.env.MONGO_SOCKET_TIMEOUT_MS) || 45000,
      maxPoolSize: Number(process.env.MONGO_MAX_POOL_SIZE) || 10,
    });

    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error Connecting to MongoDB: ${error.message}`);
    const localUri = 'mongodb://127.0.0.1:27017/jobswaale';
    if (mongoUri !== localUri && mongoUri !== 'mongodb://localhost:27017/jobswaale') {
      console.warn('Attempting fallback to local MongoDB instance...');
      try {
        const localConn = await mongoose.connect(localUri);
        console.log(`Fallback connected to local MongoDB: ${localConn.connection.host}`);
        return;
      } catch (localErr) {
        console.error(`Local MongoDB fallback failed: ${localErr.message}`);
      }
    }
    console.error('Check your internet/VPN, MongoDB Atlas network access IP whitelist, and MONGO_URI in .env.');
    throw error;
  }
};

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected. Requests that need the database may fail until it reconnects.');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

module.exports = connectDB;
