const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');
const Job = require('../models/Job');
const Payment = require('../models/Payment');
const User = require('../models/User');
const Application = require('../models/Application');

const formatDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
};

const getInitials = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] || 'U'}${parts[1]?.[0] || parts[0]?.[1] || ''}`.toUpperCase();
};

const getJobStatus = (job) => {
  if (job.publishStatus === 'draft' || job.status === 'pending') return 'Pending';
  if (job.status === 'inactive') return 'Inactive';
  if (job.status === 'closed') return 'Expired';
  if (job.jobExpiry && new Date(job.jobExpiry) < new Date()) return 'Expired';
  return 'Active';
};

const formatStatus = (status = '') => {
  const value = String(status || '').trim();
  return value ? value.charAt(0).toUpperCase() + value.slice(1).toLowerCase() : 'Pending';
};

const getMonthKey = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getMonthLabel = (date) => new Intl.DateTimeFormat('en-IN', {
  month: 'short',
  year: '2-digit'
}).format(date);

const getApplicationDateMatch = (monthsBack = 5) => {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  start.setMonth(start.getMonth() - monthsBack);
  return {
    $or: [
      { appliedDate: { $gte: start } },
      { appliedDate: { $exists: false }, createDate: { $gte: start } },
      { appliedDate: null, createDate: { $gte: start } }
    ]
  };
};

exports.getDashboardStats = async (req, res) => {
  try {
    const now = new Date();
    const notDeleted = { isDeleted: { $ne: true } };
    const activeJobFilter = {
      ...notDeleted,
      status: { $in: ['active', 'featured'] },
      publishStatus: 'publish',
      $or: [{ jobExpiry: { $exists: false } }, { jobExpiry: null }, { jobExpiry: { $gte: now } }]
    };

    const [jobseekerProfileUserIds, employerProfileUserIds] = await Promise.all([
      Jobseeker.distinct('userId', { isDeleted: { $ne: true } }),
      Employer.distinct('userId', { isDeleted: { $ne: true } })
    ]);
    const publicJobseekerFilter = {
      isDeleted: { $ne: true },
      _id: { $nin: jobseekerProfileUserIds },
      $or: [{ role: 'Jobseeker' }, { accountType: 'jobseeker' }]
    };
    const publicEmployerFilter = {
      isDeleted: { $ne: true },
      _id: { $nin: employerProfileUserIds },
      $or: [{ role: 'Employer' }, { accountType: 'employer' }]
    };

    const [
      employersCount,
      jobseekersCount,
      publicEmployersCount,
      publicJobseekersCount,
      jobsCount,
      activeJobsCount,
      activeEmployersCount,
      activeJobseekersCount,
      activePublicEmployersCount,
      activePublicJobseekersCount,
      revenueStats,
      applicationsByMonth,
      applicationsByRawStatus
    ] = await Promise.all([
      Employer.countDocuments({ isDeleted: { $ne: true } }),
      Jobseeker.countDocuments({ isDeleted: { $ne: true } }),
      User.countDocuments(publicEmployerFilter),
      User.countDocuments(publicJobseekerFilter),
      Job.countDocuments({ isDeleted: { $ne: true } }),
      Job.countDocuments(activeJobFilter),
      Employer.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
      Jobseeker.countDocuments({ isDeleted: { $ne: true }, status: 'active' }),
      User.countDocuments({ ...publicEmployerFilter, status: 'active' }),
      User.countDocuments({ ...publicJobseekerFilter, status: 'active' }),
      Payment.aggregate([
        { $match: { isDeleted: { $ne: true }, paymentStatus: 'Success' } },
        { $group: { _id: null, total: { $sum: '$paidAmount' } } }
      ]),
      Application.aggregate([
        { $match: getApplicationDateMatch(5) },
        {
          $group: {
            _id: {
              $dateToString: {
                format: '%Y-%m',
                date: { $ifNull: ['$appliedDate', '$createDate'] },
                timezone: 'Asia/Kolkata'
              }
            },
            value: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      Application.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
            hired: {
              $sum: {
                $cond: [{ $eq: ['$selectionDetails.offerStatus', 'Hired'] }, 1, 0]
              }
            }
          }
        }
      ])
    ]);
    
    const [recentJobseekers, recentJobs] = await Promise.all([
      Jobseeker.find({ isDeleted: { $ne: true } })
        .sort({ createDate: -1 })
        .limit(8)
        .populate('userId', 'email')
        .populate('jobCategory', 'categoryName')
        .lean(),
      Job.find({ isDeleted: { $ne: true } })
        .sort({ createDate: -1 })
        .limit(8)
        .populate('jobType', 'jobType')
        .lean()
    ]);

    const totalRevenue = revenueStats[0]?.total || 0;
    const monthlyApplicationCounts = new Map(
      applicationsByMonth.map((item) => [item._id, item.value])
    );
    const applicationsOverview = Array.from({ length: 6 }, (_, index) => {
      const monthDate = new Date();
      monthDate.setDate(1);
      monthDate.setHours(0, 0, 0, 0);
      monthDate.setMonth(monthDate.getMonth() - (5 - index));
      return {
        label: getMonthLabel(monthDate),
        value: monthlyApplicationCounts.get(getMonthKey(monthDate)) || 0
      };
    });
    const applicationStatusCounts = applicationsByRawStatus.reduce((acc, item) => {
      const status = item._id || 'Applied';
      acc.total += item.count || 0;
      if (status === 'Applied' || status === 'Reviewed') acc.applied += item.count || 0;
      if (status === 'Shortlisted') acc.shortlisted += item.count || 0;
      if (status === 'Interview') acc.interview += item.count || 0;
      if (status === 'Rejected') acc.rejected += item.count || 0;
      if (status === 'Offered') acc.hired += item.hired || item.count || 0;
      return acc;
    }, {
      total: 0,
      applied: 0,
      shortlisted: 0,
      interview: 0,
      hired: 0,
      rejected: 0
    });

    res.json({
      employers: employersCount + publicEmployersCount,
      jobseekers: jobseekersCount + publicJobseekersCount,
      jobsPosted: jobsCount,
      activeJobs: activeJobsCount,
      inactiveJobs: Math.max(jobsCount - activeJobsCount, 0),
      totalUsers: jobseekersCount + publicJobseekersCount,
      activeUsers: activeJobseekersCount + activePublicJobseekersCount,
      activeCompanies: activeEmployersCount + activePublicEmployersCount,
      revenue: totalRevenue,
      applicationsOverview,
      applicationsByStatus: applicationStatusCounts,
      recentCandidates: recentJobseekers.map((candidate, index) => {
        const job = recentJobs[index % Math.max(recentJobs.length, 1)];
        return {
          id: candidate._id,
          initials: getInitials(candidate.name),
          name: candidate.name,
          email: candidate.userId?.email || '',
          jobTitle: candidate.jobCategory?.categoryName || job?.jobTitle || 'Open Position',
          company: job?.companyName || 'JobsWaale',
          joinedOn: formatDate(candidate.createDate),
          status: formatStatus(candidate.status),
          gradient: ['from-indigo-500 to-purple-400', 'from-blue-500 to-sky-400', 'from-emerald-500 to-teal-400', 'from-rose-500 to-pink-400', 'from-amber-400 to-orange-300', 'from-cyan-400 to-blue-300'][index % 6]
        };
      }),
      recentJobs: recentJobs.map((job) => ({
        id: job._id,
        title: job.jobTitle,
        company: job.companyName,
        vacancies: Number(job.vacancies || 0),
        postedOn: formatDate(job.createDate || job.postingDate),
        status: getJobStatus(job),
        type: job.jobType?.jobType || ''
      }))
    });
  } catch (error) {
    console.error('Stats Error:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
};
