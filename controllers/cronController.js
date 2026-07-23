const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');
const { sendPlanExpiryEmail } = require('../utils/jobNotifications');

exports.checkPlanExpiries = async (req, res) => {
  try {
    const isVercelCron = req.headers['x-vercel-cron'] === '1';
    const hasValidSecret = req.query.secret && req.query.secret === (process.env.CRON_SECRET || 'jobswaale_cron_secret_123');

    if (!isVercelCron && !hasValidSecret) {
      return res.status(401).json({ message: 'Unauthorized cron request' });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let notifiedEmployersCount = 0;
    let notifiedJobseekersCount = 0;

    // 1. Process Employers
    const employers = await Employer.find({
      status: 'active',
      isDeleted: { $ne: true },
      planValidity: { $ne: null }
    }).populate('userId', 'email');

    for (const emp of employers) {
      if (!emp.userId?.email) continue;

      const expiryDate = new Date(emp.planValidity);
      expiryDate.setHours(0, 0, 0, 0);
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if ([7, 2, 1, 0].includes(diffDays)) {
        await sendPlanExpiryEmail({
          to: emp.userId.email,
          name: emp.contactPerson || emp.companyName,
          daysRemaining: diffDays,
          expiryDate: emp.planValidity,
          category: 'Employer',
          recipientId: emp.userId._id
        });
        notifiedEmployersCount++;
      }
    }

    // 2. Process Jobseekers
    const jobseekers = await Jobseeker.find({
      status: 'active',
      isDeleted: { $ne: true },
      planValidity: { $ne: null }
    }).populate('userId', 'email');

    for (const js of jobseekers) {
      if (!js.userId?.email) continue;

      const expiryDate = new Date(js.planValidity);
      expiryDate.setHours(0, 0, 0, 0);
      const diffTime = expiryDate.getTime() - today.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

      if ([7, 2, 1, 0].includes(diffDays)) {
        await sendPlanExpiryEmail({
          to: js.userId.email,
          name: js.name,
          daysRemaining: diffDays,
          expiryDate: js.planValidity,
          category: 'Jobseeker',
          recipientId: js.userId._id
        });
        notifiedJobseekersCount++;
      }
    }

    res.json({
      success: true,
      message: 'Plan expiry cron run completed successfully',
      employersNotified: notifiedEmployersCount,
      jobseekersNotified: notifiedJobseekersCount
    });
  } catch (error) {
    console.error('Cron Check Expiries Error:', error);
    res.status(500).json({ message: 'Cron job failed', error: error.message });
  }
};
