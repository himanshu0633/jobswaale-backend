const { getSettings } = require('./settings');
const { createTransportFromSettings } = require('./mail');
const getMailFrom = (settings = {}) => {
  const fromEmail = settings.mailFromEmail || settings.siteEmail || 'no-reply@jobswaale.com';
  const fromName = settings.mailFromName || settings.siteName || 'JobsWaale';
  return `${fromName} <${fromEmail}>`;
};
const escapeHtml = (value = '') => String(value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

// Helper to create DB notification and send via Socket
const createAndSendNotification = async ({ recipientId, title, message, type, redirectUrl }) => {
  const Notification = require('../models/Notification');
  const { getIO, getUserRoom } = require('../realtime/socket');

  try {
    const notif = await Notification.create({
      recipient: recipientId,
      title,
      message,
      type,
      redirectUrl: redirectUrl || ''
    });

    const io = getIO();
    if (io) {
      io.to(getUserRoom(recipientId)).emit('notification:new', {
        _id: notif._id,
        recipient: notif.recipient,
        title: notif.title,
        message: notif.message,
        type: notif.type,
        status: notif.status,
        redirectUrl: notif.redirectUrl,
        createDate: notif.createDate
      });
    }
    return notif;
  } catch (err) {
    console.error('Failed to create/send notification:', err);
    return null;
  }
};

const sendPlanExpiryEmail = async ({ to, name, daysRemaining, expiryDate, category, recipientId }) => {
  const timeText = daysRemaining === 0 ? 'today' : (daysRemaining === 1 ? 'tomorrow' : `in ${daysRemaining} days`);
  const dateFormatted = new Date(expiryDate).toLocaleDateString('en-IN');
  const message = `Your subscription plan on JobsWaale is expiring ${timeText} on ${dateFormatted}. Please renew/upgrade to ensure uninterrupted access.`;

  // 1. Create In-App Notification
  if (recipientId) {
    await createAndSendNotification({
      recipientId,
      title: 'Plan Expiry Reminder',
      message,
      type: 'plan_expiry',
      redirectUrl: `/${category.toLowerCase()}/subscription`
    });
  }

  // 2. Send Email
  try {
    const settings = await getSettings();
    const transporter = createTransportFromSettings(settings);

    await transporter.sendMail({
      from: getMailFrom(settings),
      to,
      subject: `Your JobsWaale ${category} Plan Expires ${timeText}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5;">
          <h2 style="color:#e11d48;margin:0 0 16px;">Plan Expiry Notification</h2>
          <p>Hi ${escapeHtml(name)},</p>
          <p>${escapeHtml(message)}</p>
          <p style="margin-top:24px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/${category.toLowerCase()}/subscription" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;">Renew Subscription</a>
          </p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Plan expiry email error:', error);
    return { sent: false, reason: error.message };
  }
};

const sendJobPostedEmail = async ({ to, employerName, jobTitle, recipientId }) => {
  const message = `Congratulations! Your job posting for "${jobTitle}" is now active and visible to candidates on JobsWaale.`;

  // 1. In-App
  if (recipientId) {
    await createAndSendNotification({
      recipientId,
      title: 'Job Posting Live',
      message,
      type: 'job_posted',
      redirectUrl: '/employer/jobs'
    });
  }

  // 2. Email
  try {
    const settings = await getSettings();
    const transporter = createTransportFromSettings(settings);

    await transporter.sendMail({
      from: getMailFrom(settings),
      to,
      subject: `Your job post is live: ${jobTitle}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5;">
          <h2 style="color:#059669;margin:0 0 16px;">Job Posting Live</h2>
          <p>Hi ${escapeHtml(employerName)},</p>
          <p>${escapeHtml(message)}</p>
          <p>You can manage applications and view details through your employer dashboard.</p>
          <p style="margin-top:24px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employer/jobs" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;">Manage Jobs</a>
          </p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Job posted email error:', error);
    return { sent: false, reason: error.message };
  }
};

const sendEmployerNewApplicationEmail = async ({ to, employerName, jobTitle, candidateName, recipientId }) => {
  const message = `A candidate named "${candidateName}" has applied for your job opening: "${jobTitle}".`;

  // 1. In-App
  if (recipientId) {
    await createAndSendNotification({
      recipientId,
      title: 'New Candidate Application',
      message,
      type: 'candidate_applied',
      redirectUrl: '/employer/applications'
    });
  }

  // 2. Email
  try {
    const settings = await getSettings();
    const transporter = createTransportFromSettings(settings);

    await transporter.sendMail({
      from: getMailFrom(settings),
      to,
      subject: `New candidate application for ${jobTitle}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5;">
          <h2 style="color:#2563eb;margin:0 0 16px;">New Candidate Application</h2>
          <p>Hi ${escapeHtml(employerName)},</p>
          <p>${escapeHtml(message)}</p>
          <p>Log in to review their details and schedule an interview.</p>
          <p style="margin-top:24px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/employer/applications" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;">View Applications</a>
          </p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Employer application email error:', error);
    return { sent: false, reason: error.message };
  }
};

const sendApplicationStatusEmail = async ({ to, seekerName, jobTitle, companyName, status, recipientId }) => {
  const message = `Your job application for "${jobTitle}" at "${companyName}" has been updated to "${status}".`;

  // 1. In-App
  if (recipientId) {
    await createAndSendNotification({
      recipientId,
      title: 'Application Status Updated',
      message,
      type: 'application_status',
      redirectUrl: '/jobseeker/applications'
    });
  }

  // 2. Email
  try {
    const settings = await getSettings();
    const transporter = createTransportFromSettings(settings);

    await transporter.sendMail({
      from: getMailFrom(settings),
      to,
      subject: `Application status updated for ${jobTitle}`,
      html: `
        <div style="font-family:Arial,Helvetica,sans-serif;color:#1f2937;line-height:1.5;">
          <h2 style="color:#0f172a;margin:0 0 16px;">Application Status Update</h2>
          <p>Hi ${escapeHtml(seekerName)},</p>
          <p>${escapeHtml(message)}</p>
          <p>Please log in to your dashboard to check further details or instructions.</p>
          <p style="margin-top:24px;">
            <a href="${process.env.FRONTEND_URL || 'http://localhost:5173'}/jobseeker/applications" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;font-weight:700;">View My Applications</a>
          </p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('Application status update email error:', error);
    return { sent: false, reason: error.message };
  }
};

const notifyMatchingJobseekers = async (job) => {
  const Jobseeker = require('../models/Jobseeker');
  const JobCategory = require('../models/JobCategory');

  try {
    const seekers = await Jobseeker.find({
      status: 'active',
      isDeleted: { $ne: true },
      jobSearchStatus: 'looking'
    }).populate('userId', 'email');

    const category = await JobCategory.findById(job.jobCategory).select('categoryName').lean();
    const categoryName = category?.categoryName || 'Job';

    for (const seeker of seekers) {
      if (!seeker.userId?.email) continue;

      const categoryMatch = String(seeker.jobCategory || '') === String(job.jobCategory || '');

      const jobCity = String(job.city || '').toLowerCase().trim();
      const jobState = String(job.state || '').toLowerCase().trim();
      const seekerCity = String(seeker.city || '').toLowerCase().trim();
      const seekerState = String(seeker.state || '').toLowerCase().trim();
      const preferred = String(seeker.preferredLocation || '').toLowerCase().trim();

      const locationMatch = 
        (jobCity && (jobCity === seekerCity || preferred.includes(jobCity))) ||
        (jobState && (jobState === seekerState || preferred.includes(jobState)));

      if (categoryMatch || locationMatch) {
        // 1. In-App Notification
        await createAndSendNotification({
          recipientId: seeker.userId._id,
          title: 'Matching Job Opening',
          message: `A new job "${job.jobTitle}" matching your profile has been posted by ${job.companyName}.`,
          type: 'job_alert',
          redirectUrl: `/jobs/${job.slug || job._id}`
        });

        // 2. Email
        const { sendJobAlertEmail } = require('./mail');
        await sendJobAlertEmail({
          to: seeker.userId.email,
          seekerName: seeker.name,
          job,
          categoryName
        });
      }
    }
  } catch (err) {
    console.error('Error notifying matching jobseekers:', err);
  }
};

module.exports = {
  sendPlanExpiryEmail,
  sendJobPostedEmail,
  sendEmployerNewApplicationEmail,
  sendApplicationStatusEmail,
  notifyMatchingJobseekers,
  createAndSendNotification
};
