const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Application = require('../models/Application');
const Jobseeker = require('../models/Jobseeker');

let ioInstance = null;

const getUserRoom = (userId) => `user:${userId}`;
const getApplicationRoom = (applicationId) => `application:${applicationId}`;

const getSocketActor = (user) => {
  const role = String(user?.role || '').trim().toLowerCase();
  const accountType = String(user?.accountType || '').trim().toLowerCase();
  if (role === 'employer' || accountType === 'employer') return 'employer';
  if (role === 'jobseeker' || accountType === 'jobseeker') return 'jobseeker';
  return '';
};





const canAccessApplication = async (user, actor, applicationId) => {
  const application = await Application.findById(applicationId)
    .populate('job', 'login')
    .populate('candidate', 'userId')
    .lean();

  if (!application?.job || !application?.candidate) return false;
  if (actor === 'employer') return String(application.job.login) === String(user._id);
  if (actor === 'jobseeker') return String(application.candidate.userId) === String(user._id);
  return false;
};

const initSocket = (server, corsOptions) => {
  const { Server } = require('socket.io');
  const io = new Server(server, {
    cors: corsOptions,
    transports: ['websocket', 'polling']
  });

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace(/^Bearer\s+/i, '');
      if (!token) return next(new Error('Authentication token is required.'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
      const user = await User.findById(decoded.id).select('-password').lean();
      if (!user) return next(new Error('User no longer exists.'));

      const actor = getSocketActor(user);
      if (!actor) return next(new Error('Realtime chat is available only for employer and jobseeker accounts.'));

      socket.user = user;
      socket.actor = actor;
      next();
    } catch (error) {
      next(new Error('Socket authentication failed.'));
    }
  });

  io.on('connection', (socket) => {
    socket.join(getUserRoom(socket.user._id));

    socket.on('message:join', async ({ applicationId } = {}) => {
      if (!applicationId) return;
      const allowed = await canAccessApplication(socket.user, socket.actor, applicationId);
      if (allowed) socket.join(getApplicationRoom(applicationId));
    });

    socket.on('message:leave', ({ applicationId } = {}) => {
      if (applicationId) socket.leave(getApplicationRoom(applicationId));
    });

    socket.on('message:typing', async ({ applicationId, isTyping } = {}) => {
      if (!applicationId) return;
      const allowed = await canAccessApplication(socket.user, socket.actor, applicationId);
      if (!allowed) return;

      socket.to(getApplicationRoom(applicationId)).emit('message:typing', {
        applicationId,
        isTyping: Boolean(isTyping),
        actor: socket.actor,
        userId: socket.user._id
      });
    });
  });

  ioInstance = io;
  return io;
};

const getIO = () => ioInstance;

module.exports = {
  initSocket,
  getIO,
  getUserRoom,
  getApplicationRoom
};
