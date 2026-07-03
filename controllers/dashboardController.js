const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');
const Job = require('../models/Job');
const Payment = require('../models/Payment');
const User = require('../models/User');

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
      revenueStats
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

    res.json({
      employers: employersCount + publicEmployersCount,
      jobseekers: jobseekersCount + publicJobseekersCount,
      jobsPosted: jobsCount,
      activeJobs: activeJobsCount,
      totalUsers: jobseekersCount + publicJobseekersCount,
      activeUsers: activeJobseekersCount + activePublicJobseekersCount,
      activeCompanies: activeEmployersCount + activePublicEmployersCount,
      revenue: totalRevenue,
      applicationsOverview: [],
      applicationsByStatus: {
        total: 0,
        applied: 0,
        shortlisted: 0,
        interview: 0,
        hired: 0,
        rejected: 0
      },
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
