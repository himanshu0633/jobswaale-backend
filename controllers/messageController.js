const Application = require('../models/Application');
const Jobseeker = require('../models/Jobseeker');
const Message = require('../models/Message');
const { getIO, getUserRoom } = require('../realtime/socket');

const JOBSEEKER_MESSAGE_STATUSES = ['Shortlisted', 'Interview', 'Offered'];
const CLOSED_JOB_STATUSES = ['inactive', 'closed', 'paused'];

const isJobActive = (job) => {
  if (!job || job.isDeleted === true) return false;
  const status = String(job.status || '').trim().toLowerCase();
  if (!status || CLOSED_JOB_STATUSES.includes(status)) return false;
  if (job.publishStatus && job.publishStatus !== 'publish') return false;
  return true;
};

const canMessageApplication = (application, actor) => {
  const jobActive = isJobActive(application?.job);
  if (!jobActive) return false;
  if (actor === 'employer') return true;
  return JOBSEEKER_MESSAGE_STATUSES.includes(application?.status);
};

const getInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'U') + (parts[1]?.[0] || '');
};

const formatReply = (replyTo, actor) => {
  if (!replyTo) return null;
  const fallbackText = replyTo.attachment?.originalName
    ? `Attachment: ${replyTo.attachment.originalName}`
    : '';
  return {
    id: replyTo._id,
    text: replyTo.body || fallbackText,
    sender: replyTo.senderRole === actor ? 'sent' : 'received',
    senderRole: replyTo.senderRole
  };
};

const formatAttachment = (attachment) => {
  if (!attachment?.url) return null;
  return {
    url: attachment.url,
    originalName: attachment.originalName || 'Attachment',
    mimeType: attachment.mimeType || '',
    size: attachment.size || 0,
    fileType: attachment.fileType || (String(attachment.mimeType || '').startsWith('image/') ? 'image' : 'document')
  };
};

const formatMessage = (message, actor) => ({
  id: message._id,
  text: message.body,
  time: new Date(message.createDate).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
  date: message.createDate,
  sender: message.senderRole === actor ? 'sent' : 'received',
  senderRole: message.senderRole,
  attachment: formatAttachment(message.attachment),
  replyTo: formatReply(message.replyTo, actor)
});

const countUnreadMessages = async (actor, userId) => {
  if (actor === 'employer') {
    return Message.countDocuments({
      employer: userId,
      senderRole: 'jobseeker',
      readAt: null
    });
  }

  const seeker = await Jobseeker.findOne({ userId }).select('_id').lean();
  if (!seeker) return 0;

  return Message.countDocuments({
    candidate: seeker._id,
    senderRole: 'employer',
    readAt: null
  });
};

const populateApplicationQuery = () => ([
  {
    path: 'job',
    select: 'jobTitle companyName contactPerson status publishStatus jobExpiry isDeleted login',
    populate: { path: 'jobType', select: 'jobType' }
  },
  {
    path: 'candidate',
    populate: { path: 'userId', select: 'email firstName lastName' }
  }
]);

const getAccessibleApplications = async (req, actor) => {
  if (actor === 'employer') {
    const applications = await Application.find({})
      .populate(populateApplicationQuery())
      .sort({ updateDate: -1, createDate: -1 })
      .lean();

    return applications.filter(app => String(app.job?.login) === String(req.user._id));
  }

  const seeker = await Jobseeker.findOne({ userId: req.user._id }).select('_id').lean();
  if (!seeker) return [];

  return Application.find({ candidate: seeker._id })
    .populate(populateApplicationQuery())
    .sort({ updateDate: -1, createDate: -1 })
    .lean();
};

const getAccessibleApplicationById = async (req, actor, applicationId) => {
  const application = await Application.findById(applicationId)
    .populate(populateApplicationQuery())
    .lean();

  if (!application || !application.job || !application.candidate) return null;

  if (actor === 'employer') {
    return String(application.job.login) === String(req.user._id) ? application : null;
  }

  const seeker = await Jobseeker.findOne({ userId: req.user._id }).select('_id').lean();
  if (!seeker) return null;
  return String(application.candidate._id) === String(seeker._id) ? application : null;
};

const buildThreadSummary = async (application, actor) => {
  const [lastMessage, unreadCount] = await Promise.all([
    Message.findOne({ application: application._id }).sort({ createDate: -1 }).lean(),
    Message.countDocuments({
      application: application._id,
      senderRole: actor === 'employer' ? 'jobseeker' : 'employer',
      readAt: null
    })
  ]);

  const candidateName = application.candidate?.name || 'Candidate';
  const employerName = application.job?.companyName || 'Employer';
  const otherName = actor === 'employer' ? candidateName : employerName;

  return {
    id: application._id,
    applicationId: application._id,
    jobId: application.job?._id,
    jobTitle: application.job?.jobTitle || 'Job',
    name: otherName,
    role: actor === 'employer'
      ? `Applied for ${application.job?.jobTitle || 'Job'}`
      : `${application.job?.companyName || 'Employer'} · ${application.job?.jobTitle || 'Job'}`,
    initials: getInitials(otherName).toUpperCase(),
    status: application.status,
    canMessage: canMessageApplication(application, actor),
    disabledReason: !isJobActive(application.job)
      ? 'This job is no longer active.'
      : actor === 'jobseeker' && !JOBSEEKER_MESSAGE_STATUSES.includes(application.status)
      ? 'Messaging opens after shortlist, interview, or selection.'
      : '',
    lastMessage: lastMessage?.body || (lastMessage?.attachment?.originalName ? `Attachment: ${lastMessage.attachment.originalName}` : 'No messages yet.'),
    lastMessageAt: lastMessage?.createDate || application.updateDate || application.createDate,
    time: lastMessage
      ? new Date(lastMessage.createDate).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '',
    unread: unreadCount
  };
};

const listMessages = (actor) => async (req, res) => {
  try {
    const applications = await getAccessibleApplications(req, actor);
    const jobId = String(req.query.jobId || '').trim();
    const filtered = jobId
      ? applications.filter(app => String(app.job?._id) === jobId)
      : applications;

    const threads = await Promise.all(filtered.map(app => buildThreadSummary(app, actor)));
    threads.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));
    res.json({ threads });
  } catch (error) {
    console.error('List Messages Error:', error);
    res.status(500).json({ message: 'Server error loading messages' });
  }
};

const getUnreadCount = (actor) => async (req, res) => {
  try {
    const unreadCount = await countUnreadMessages(actor, req.user._id);
    res.json({ unreadCount });
  } catch (error) {
    console.error('Unread Messages Error:', error);
    res.status(500).json({ message: 'Server error loading unread messages' });
  }
};

const getThread = (actor) => async (req, res) => {
  try {
    const application = await getAccessibleApplicationById(req, actor, req.params.applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    await Message.updateMany({
      application: application._id,
      senderRole: actor === 'employer' ? 'jobseeker' : 'employer',
      readAt: null
    }, { readAt: new Date() });

    const io = getIO();
    if (io) {
      io.to(getUserRoom(req.user._id)).emit('messages:unread', {
        unreadCount: await countUnreadMessages(actor, req.user._id)
      });
    }

    const messages = await Message.find({ application: application._id })
      .populate('replyTo', 'body senderRole attachment')
      .sort({ createDate: 1 })
      .lean();
    const thread = await buildThreadSummary(application, actor);

    res.json({
      thread,
      messages: messages.map(message => formatMessage(message, actor))
    });
  } catch (error) {
    console.error('Get Message Thread Error:', error);
    res.status(500).json({ message: 'Server error loading conversation' });
  }
};

const sendMessage = (actor) => async (req, res) => {
  try {
    const body = String(req.body?.message || '').trim();
    const uploadedFile = req.file || null;
    if (!body && !uploadedFile) {
      return res.status(400).json({ message: 'Message or attachment is required.' });
    }
    if (body.length > 2000) {
      return res.status(400).json({ message: 'Message cannot exceed 2000 characters.' });
    }

    const application = await getAccessibleApplicationById(req, actor, req.params.applicationId);
    if (!application) {
      return res.status(404).json({ message: 'Conversation not found.' });
    }

    if (!canMessageApplication(application, actor)) {
      return res.status(403).json({
        message: !isJobActive(application.job)
          ? 'This job is no longer active, so messaging is closed.'
          : 'You can message only after shortlist, interview, or selection.'
      });
    }

    let replyTo = null;
    const replyToId = String(req.body?.replyTo || '').trim();
    if (replyToId) {
      replyTo = await Message.findOne({
        _id: replyToId,
        application: application._id
      }).select('_id body senderRole application attachment').lean();

      if (!replyTo) {
        return res.status(400).json({ message: 'Reply message was not found in this conversation.' });
      }
    }

    let attachment = undefined;
    if (uploadedFile) {
      const fs = require('fs');
      const Attachment = require('../models/Attachment');
      try {
        const fileData = fs.readFileSync(uploadedFile.path);
        await Attachment.create({
          filename: uploadedFile.filename,
          data: fileData,
          mimeType: uploadedFile.mimetype,
          size: uploadedFile.size
        });

        attachment = {
          url: `${req.protocol}://${req.get('host')}/uploads/messages/${uploadedFile.filename}`,
          originalName: uploadedFile.originalname,
          mimeType: uploadedFile.mimetype,
          size: uploadedFile.size,
          fileType: uploadedFile.mimetype.startsWith('image/') ? 'image' : 'document'
        };

        fs.unlink(uploadedFile.path, () => {});
      } catch (uploadError) {
        console.error('Failed to save file to DB:', uploadError);
        return res.status(500).json({ message: 'File upload persistence failed.' });
      }
    }

    const message = await Message.create({
      application: application._id,
      job: application.job._id,
      employer: application.job.login,
      candidate: application.candidate._id,
      sender: req.user._id,
      senderRole: actor,
      body,
      ...(attachment ? { attachment } : {}),
      replyTo: replyTo?._id || null
    });
    const messageForResponse = { ...message.toObject(), replyTo };

    const recipientRole = actor === 'employer' ? 'jobseeker' : 'employer';
    const recipientUserId = actor === 'employer'
      ? application.candidate.userId?._id || application.candidate.userId
      : application.job.login;
    const io = getIO();
    const senderThread = await buildThreadSummary(application, actor);
    const recipientThread = await buildThreadSummary(application, recipientRole);

    if (io && recipientUserId) {
      io.to(getUserRoom(recipientUserId)).emit('message:new', {
        applicationId: application._id,
        jobId: application.job._id,
        jobTitle: application.job.jobTitle || 'Job',
        senderRole: actor,
        recipientRole,
        message: formatMessage(messageForResponse, recipientRole),
        thread: recipientThread,
        unreadCount: await countUnreadMessages(recipientRole, recipientUserId),
        notification: {
          title: actor === 'employer'
            ? `${application.job.companyName || 'Employer'} sent a message`
            : `${application.candidate.name || 'Candidate'} sent a message`,
          body: `${application.job.jobTitle || 'Job'}: ${(body || attachment?.originalName || 'Attachment').slice(0, 120)}`
        }
      });
    }

    if (io) {
      io.to(getUserRoom(req.user._id)).emit('messages:unread', {
        unreadCount: await countUnreadMessages(actor, req.user._id)
      });
    }

    res.status(201).json({
      message: formatMessage(messageForResponse, actor),
      thread: senderThread
    });
  } catch (error) {
    console.error('Send Message Error:', error);
    res.status(500).json({ message: 'Server error sending message' });
  }
};

module.exports = {
  listEmployerMessages: listMessages('employer'),
  getEmployerUnreadCount: getUnreadCount('employer'),
  getEmployerMessageThread: getThread('employer'),
  sendEmployerMessage: sendMessage('employer'),
  listJobseekerMessages: listMessages('jobseeker'),
  getJobseekerUnreadCount: getUnreadCount('jobseeker'),
  getJobseekerMessageThread: getThread('jobseeker'),
  sendJobseekerMessage: sendMessage('jobseeker')
};
