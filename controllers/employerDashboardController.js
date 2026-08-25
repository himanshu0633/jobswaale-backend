const Employer = require('../models/Employer');
const fs = require('fs');
const path = require('path');
const Job = require('../models/Job');
const Jobseeker = require('../models/Jobseeker');
const Application = require('../models/Application');
const JobCategory = require('../models/JobCategory');
const JobType = require('../models/JobType');
const Qualification = require('../models/Qualification');
const City = require('../models/City');
const State = require('../models/State');
const District = require('../models/District');
const Country = require('../models/Country');
const IndustryType = require('../models/IndustryType');
const Plan = require('../models/Plan');
const Payment = require('../models/Payment');
const TalentPool = require('../models/TalentPool');
const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');
const Attachment = require('../models/Attachment');
const EmployerResumeUnlock = require('../models/EmployerResumeUnlock');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { seedEmployerPlansIfEmpty } = require('../utils/seedEmployerPlans');
const {
  ensureEmployerAutoMailSetting,
  getEmployerAutoMailSummary,
  updateEmployerAutoMailSetting,
  sendEmployerJobAutoMails
} = require('../utils/employerAutoMail');

const formatDate = (value) => {
  if (!value) return null;
  return new Date(value).toISOString();
};

const checkEmployerPlanAccess = async (userId, candidateId = null) => {
  try {
    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).populate('currentPlan');

    if (!employer || !employer.currentPlan) {
      console.log('[DEBUG checkEmployerPlanAccess] Employer or currentPlan not found', { userId });
      return { hasCandidateAccess: false, unlockLimitExhausted: false, isUnlocked: false };
    }

    const plan = employer.currentPlan;
    const planEndDate = employer.planValidity || plan.endDate || null;
    
    let isPlanActive = true;
    if (planEndDate) {
      const planEndDateStr = String(planEndDate).toLowerCase();
      if (planEndDateStr.includes('free') || planEndDateStr.includes('always')) {
        isPlanActive = true;
      } else {
        const endTime = new Date(planEndDate).getTime();
        if (!isNaN(endTime)) {
          isPlanActive = endTime >= Date.now();
        }
      }
    }

    console.log('[DEBUG checkEmployerPlanAccess] Plan details', {
      employer: employer.companyName || employer.login,
      planName: plan.planName,
      planEndDate,
      isPlanActive,
      showContactDetails: plan.showContactDetails,
      allowResumeDownload: plan.allowResumeDownload
    });

    if (!isPlanActive) {
      return { hasCandidateAccess: false, unlockLimitExhausted: false, isUnlocked: false };
    }

    const hasAccess = Boolean(plan.showContactDetails || plan.allowResumeDownload);
    if (!hasAccess) {
      return { hasCandidateAccess: false, unlockLimitExhausted: false, isUnlocked: false };
    }

    const unlockLimit = getUnlockLimit(plan);
    const planId = plan._id || null;

    let isUnlocked = false;
    if (candidateId) {
      const existing = await EmployerResumeUnlock.findOne({
        employer: employer._id,
        candidate: candidateId,
        plan: planId,
        isDeleted: { $ne: true }
      });
      if (existing) {
        isUnlocked = true;
      }
    }

    const usedUnlocks = await EmployerResumeUnlock.countDocuments({
      employer: employer._id,
      plan: planId,
      isDeleted: { $ne: true }
    });

    const unlockLimitExhausted = usedUnlocks >= unlockLimit;

    return {
      hasCandidateAccess: true,
      unlockLimitExhausted,
      isUnlocked,
      employerId: employer._id,
      planId,
      unlockLimit,
      usedUnlocks
    };
  } catch (err) {
    console.error('checkEmployerPlanAccess Error:', err);
    return { hasCandidateAccess: false, unlockLimitExhausted: false, isUnlocked: false };
  }
};

const getEmployerShowContactDetails = async (userId) => {
  const access = await checkEmployerPlanAccess(userId);
  return access.hasCandidateAccess;
};

const getEmployerAllowResumeDownload = async (userId) => {
  const access = await checkEmployerPlanAccess(userId);
  return access.hasCandidateAccess;
};

const daysFromNow = (value) => {
  if (!value) return null;
  const diffMs = new Date(value).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const daysFromToday = (value) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
};

const getNextPaymentId = async () => {
  const lastPayment = await Payment.findOne({ paymentId: /^PAY-\d+$/ })
    .sort({ createDate: -1 })
    .select('paymentId');
  const lastNumber = lastPayment ? Number(lastPayment.paymentId.replace('PAY-', '')) : 0;
  return `PAY-${String(lastNumber + 1).padStart(3, '0')}`;
};

const getNextInvoiceNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const lastPayment = await Payment.findOne({ invoiceNo: new RegExp(`^${prefix}\\d+$`) })
    .sort({ createDate: -1 })
    .select('invoiceNo');
  const lastNumber = lastPayment ? Number(lastPayment.invoiceNo.replace(prefix, '')) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(3, '0')}`;
};

const getPlanEndDate = (plan, startDate = new Date()) => {
  if (plan?.endDate) return new Date(plan.endDate);

  const validityDays = {
    Weekly: 7,
    Monthly: 30,
    Quarterly: 90,
    'Half-Yearly': 180,
    Yearly: 365,
    'One Time': 30,
    'Always Free': 36500
  };

  return addDays(startDate, validityDays[plan?.planValidity] || 30);
};

const getUnlockLimit = (plan) => {
  const rawValue = String(plan?.unlockCount || '').trim();
  if (!rawValue) return 0;
  if (/unlimited/i.test(rawValue)) return Number.POSITIVE_INFINITY;
  const parsed = Number(rawValue.replace(/[^\d]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const getEmployerPlanUsage = async ({ userId, employerId, plan, allJobs = null, billingHistory = null }) => {
  const planId = plan?._id || plan || null;
  const planLimit = Number(plan?.freeJobPosts || 0);
  const totalJobs = Array.isArray(allJobs)
    ? allJobs.length
    : await Job.countDocuments({ login: userId, isDeleted: { $ne: true } });
  const getTime = (value) => {
    const time = value ? new Date(value).getTime() : 0;
    return Number.isNaN(time) ? 0 : time;
  };

  let payments = billingHistory;
  if (!payments && planId) {
    payments = await Payment.find({
      $or: [
        ...(employerId ? [{ customer: employerId }] : []),
        { login: userId }
      ],
      paymentStatus: 'Success',
      isDeleted: { $ne: true }
    }).sort({ paymentDate: -1, createDate: -1 }).lean();
  }

  const sortedPayments = Array.isArray(payments)
    ? [...payments].sort((a, b) => {
        const bTime = Math.max(getTime(b.validFrom), getTime(b.paymentDate), getTime(b.createDate));
        const aTime = Math.max(getTime(a.validFrom), getTime(a.paymentDate), getTime(a.createDate));
        return bTime - aTime;
      })
    : [];

  const latestPlanPayment = planId
    ? (sortedPayments.find((payment) => String(payment.plan || '') === String(planId)) || sortedPayments[0] || null)
    : null;
  const subscriptionStart = latestPlanPayment?.validFrom || latestPlanPayment?.paymentDate || latestPlanPayment?.createDate || null;
  const currentPlanJobFilter = {
    login: userId,
    isDeleted: { $ne: true }
  };

  if (planId) currentPlanJobFilter.currentPlan = planId;
  if (subscriptionStart) currentPlanJobFilter.createDate = { $gte: new Date(subscriptionStart) };

  const jobsUsed = planId
    ? await Job.countDocuments(currentPlanJobFilter)
    : totalJobs;
  const remainingCredits = Math.max(planLimit - jobsUsed, 0);
  const utilization = planLimit > 0 ? Math.min(Math.round((jobsUsed / planLimit) * 100), 100) : 0;

  return {
    jobsUsed,
    totalJobs,
    remainingCredits,
    utilization,
    subscriptionStart
  };
};

const splitList = (value) => {
  if (Array.isArray(value)) return value.map(item => String(item).trim()).filter(Boolean);
  return String(value || '').split(',').map(item => item.trim()).filter(Boolean);
};

const nullableNumber = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const numberValue = Number(value);
  return Number.isNaN(numberValue) ? null : numberValue;
};

const getInitials = (name = '') => {
  const cleanName = String(name).replace(/[^a-zA-Z\s]/g, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'C') + (parts[1]?.[0] || parts[0]?.[1] || '');
};


const getEmployerProfileCompletion = (employer = {}, user = {}) => {
  const profile = {
    companyName: employer?.companyName || user?.companyName || '',
    contactPerson: employer?.contactPerson || `${user?.firstName || ''} ${user?.lastName || ''}`.trim(),
    email: user?.email || '',
    phone: employer?.phone || user?.phone || '',
    industryType: employer?.industryType || null,
    website: employer?.website || '',
    description: employer?.description || '',
    country: employer?.country || '',
    state: employer?.state || '',
    district: employer?.district || '',
    city: employer?.city || '',
    address: employer?.address || '',
    pinCode: employer?.pinCode || '',
    tagline: employer?.tagline || '',
    foundedYear: employer?.foundedYear || '',
    companySize: employer?.companySize || user?.companySize || '',
    gstNumber: employer?.gstNumber || '',
    logo: employer?.logo || '',
    socialLinks: employer?.socialLinks || {}
  };

  const profileFields = [
    { key: 'companyName', label: 'Company name' },
    { key: 'contactPerson', label: 'Contact person' },
    { key: 'industryType', label: 'Industry type' },
    { key: 'companySize', label: 'Company size' },
    { key: 'tagline', label: 'Company tagline' },
    { key: 'foundedYear', label: 'Founded year' },
    { key: 'website', label: 'Website URL' },
    { key: 'email', label: 'Contact email' },
    { key: 'phone', label: 'Phone number' },
    { key: 'gstNumber', label: 'GST / VAT number' },
    { key: 'logo', label: 'Company logo' },
    { key: 'description', label: 'About company' },
    { key: 'country', label: 'Country' },
    { key: 'state', label: 'State' },
    { key: 'district', label: 'District' },
    { key: 'city', label: 'City' },
    { key: 'address', label: 'Full address' },
    { key: 'pinCode', label: 'Pincode' }
  ];
  const socialFields = [
    { key: 'linkedin', label: 'LinkedIn' },
    { key: 'twitter', label: 'Twitter' },
    { key: 'youtube', label: 'YouTube' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'instagram', label: 'Instagram' }
  ];

  const hasValue = (value) => {
    if (value && typeof value === 'object') return Boolean(value._id || value.id);
    return Boolean(String(value || '').trim());
  };

  const profileResults = profileFields.map(field => ({
    ...field,
    completed: hasValue(profile[field.key])
  }));
  const socialResults = socialFields.map(field => ({
    ...field,
    completed: hasValue(profile.socialLinks?.[field.key])
  }));
  const completedProfileFields = profileResults.filter(field => field.completed).length;
  const completedSocialFields = socialResults.filter(field => field.completed).length;
  const profileScore = (completedProfileFields / profileFields.length) * 95;
  const socialScore = (completedSocialFields / socialFields.length) * 5;
  const profileCompletionScore = Math.round(profileScore + socialScore);
  const missingFields = [...profileResults, ...socialResults]
    .filter(field => !field.completed)
    .map(field => field.label);

  return {
    profileIncomplete: missingFields.length > 0,
    profileCompletionScore,
    profileMissingFields: missingFields,
    profileCompletionBreakdown: {
      profileFields: {
        completed: completedProfileFields,
        total: profileFields.length,
        maxScore: 95,
        perFieldScore: Number((95 / profileFields.length).toFixed(2))
      },
      socialLinks: {
        completed: completedSocialFields,
        total: socialFields.length,
        maxScore: 5,
        perFieldScore: 1
      }
    }
  };
};

const getExperienceValue = (value = '') => {
  const text = String(value).toLowerCase();
  if (text.includes('fresher')) return 0;
  const numbers = text.match(/\d+/g);
  if (!numbers?.length) return 0;
  return Math.max(...numbers.map(Number));
};

const parseSalaryRange = (value = '') => {
  const numbers = String(value).match(/\d+(\.\d+)?/g) || [];
  const min = numbers[0] ? Number(numbers[0]) : null;
  const max = numbers[1] ? Number(numbers[1]) : min;
  return { min, max };
};

const formatDisplayDate = (value) => {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value));
};

const ensureApplicationsExist = async (userId) => {
  try {
    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).lean();
    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };

    return await Job.find({ ...ownershipFilter, isDeleted: { $ne: true } })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .lean();
  } catch (err) {
    console.error('Error loading employer jobs/applications:', err);
    return [];
  }
};

const paginate = (items, pageValue, limitValue) => {
  const page = Math.max(Number(pageValue) || 1, 1);
  const limit = Math.max(Number(limitValue) || 10, 1);
  const total = items.length;
  const totalPages = Math.max(Math.ceil(total / limit), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * limit;
  return {
    items: items.slice(start, start + limit),
    pagination: { page: safePage, limit, total, totalPages }
  };
};

const mapCandidate = (candidate, index = 0, showContacts = true, allowDownload = true, hasCandidateAccess = true) => {
  const salary = parseSalaryRange(candidate.expectedSalary);
  const createdAt = candidate.createDate || candidate.createdAt;
  const isRecent = createdAt && (Date.now() - new Date(createdAt).getTime()) <= 7 * 24 * 60 * 60 * 1000;
  const updatedToday = candidate.updateDate && new Date(candidate.updateDate).toDateString() === new Date().toDateString();

  const hiddenText = hasCandidateAccess ? 'Hidden (Unlock to View)' : 'Hidden (Upgrade Plan)';

  return {
    id: candidate._id,
    name: candidate.name,
    email: showContacts ? (candidate.userId?.email || '') : hiddenText,
    phone: showContacts ? (candidate.phone || '') : hiddenText,
    location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || 'N/A',
    role: candidate.jobCategory?.categoryName || 'Candidate',
    experience: candidate.experience || 'Fresher',
    experienceValue: getExperienceValue(candidate.experience),
    qualification: candidate.qualification?.name || '',
    expectedSalary: candidate.expectedSalary || 'Not specified',
    salaryMin: salary.min,
    salaryMax: salary.max,
    availability: candidate.status === 'active' ? 'Immediate' : '30 Days',
    skills: [],
    industry: candidate.industryType?.industryType || candidate.industryType?.name || candidate.industryType?.industryName || '',
    gender: candidate.gender || '',
    languages: [],
    company: candidate.currentPlan?.planName || '',
    age: null,
    employmentType: candidate.jobType?.jobType || '',
    initials: getInitials(candidate.name).toUpperCase(),
    avatarTone: ['from-rose-200 to-amber-200', 'from-blue-200 to-red-200', 'from-pink-200 to-slate-300', 'from-yellow-200 to-orange-200', 'from-sky-200 to-slate-200', 'from-amber-200 to-emerald-200', 'from-purple-200 to-pink-200'][index % 7],
    isPremium: Boolean(candidate.currentPlan),
    isRecent,
    resume: allowDownload ? (candidate.resume || '') : '',
    hasResume: Boolean(candidate.resume),
    allowResumeDownload: allowDownload
  };
};

const getJobDisplayStatus = (job) => {
  if (job.publishStatus === 'draft' || job.status === 'pending') return 'Draft';
  if (job.status === 'inactive') return 'Paused';
  if (job.status === 'closed') return 'Closed';
  const remainingDays = daysFromToday(job.jobExpiry);
  if (remainingDays !== null && remainingDays < 0) return 'Expired';
  return 'Active';
};

const getJobLocationText = (job) => {
  const locations = job.jobLocations && job.jobLocations.length ? job.jobLocations : [job.city, job.state];
  return locations.filter(Boolean).join(', ') || 'N/A';
};

const buildJobPreview = async (req, employer, payload) => {
  const [jobType, category] = await Promise.all([
    payload.jobType ? JobType.findById(payload.jobType).lean() : null,
    payload.jobCategory ? JobCategory.findById(payload.jobCategory).lean() : null
  ]);
  const minSalary = payload.minSalary || '';
  const maxSalary = payload.maxSalary || '';
  const salaryUnit = payload.salaryUnit || '';
  const salary = payload.salary || (
    minSalary || maxSalary
      ? `Rs. ${minSalary || '0'} - Rs. ${maxSalary || '0'} ${salaryUnit}`.trim()
      : 'Salary not specified'
  );
  const locations = splitList(payload.jobLocations || payload.city || employer?.city);

  return {
    title: payload.jobTitle || 'Software Developer',
    companyName: payload.companyName || employer?.companyName || req.user.companyName || req.user.firstName || 'Employer',
    companyLogo: employer?.logo || '',
    location: locations.length ? locations.join(', ') : [employer?.city, employer?.state].filter(Boolean).join(', ') || 'Bangalore, Karnataka',
    employmentType: jobType?.jobType || payload.employmentType || payload.jobTypeName || 'Full Time',
    category: category?.categoryName || '',
    experience: payload.requiredExperience || payload.experience || '2+ Years',
    salary,
    workMode: payload.workMode || 'Office',
    openings: Number(payload.vacancies || payload.openings || 2),
    skills: splitList(payload.skills).length ? splitList(payload.skills) : ['JavaScript', 'React.js', 'HTML', 'CSS'],
    description: payload.jobSummary || payload.description || payload.detailedDescription || 'Write a concise summary for candidates.'
  };
};

exports.getEmployerJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).lean();
    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName || req.user.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };

    const jobs = await Job.find({ ...ownershipFilter, isDeleted: { $ne: true } })
      .sort({ createDate: -1 })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .lean();
    const jobIds = jobs.map(job => job._id);
    const applicationCounts = await Application.aggregate([
      { $match: { job: { $in: jobIds } } },
      {
        $group: {
          _id: '$job',
          total: { $sum: 1 },
          shortlisted: {
            $sum: { $cond: [{ $eq: ['$status', 'Shortlisted'] }, 1, 0] }
          },
          interviews: {
            $sum: { $cond: [{ $eq: ['$status', 'Interview'] }, 1, 0] }
          }
        }
      }
    ]);
    const applicationCountMap = applicationCounts.reduce((acc, item) => {
      acc[String(item._id)] = item;
      return acc;
    }, {});

    const mappedJobs = jobs.map((job) => {
      const displayStatus = getJobDisplayStatus(job);
      const counts = applicationCountMap[String(job._id)] || {};
      const applications = Number(counts.total || 0);
      const shortlisted = Number(counts.shortlisted || 0);
      const interviews = Number(counts.interviews || 0);
      const views = Number(job.views || job.viewCount || job.profileViews || 0);
      return {
        id: job._id,
        title: job.jobTitle,
        postDate: formatDate(job.createDate || job.postingDate),
        location: getJobLocationText(job),
        jobType: job.jobType?.jobType || 'N/A',
        expiry: formatDate(job.jobExpiry),
        status: displayStatus,
        rawStatus: job.status,
        publishStatus: job.publishStatus,
        vacancies: job.vacancies || 0,
        workMode: job.workMode || '',
        category: job.jobCategory?.categoryName || '',
        applications,
        applicants: applications,
        views,
        shortlisted,
        interviews
      };
    });

    res.json({
      stats: {
        active: mappedJobs.filter(job => job.status === 'Active').length,
        draft: mappedJobs.filter(job => job.status === 'Draft').length,
        expiring: 0,
        expired: mappedJobs.filter(job => job.status === 'Expired').length,
        closed: mappedJobs.filter(job => job.status === 'Closed' || job.status === 'Paused').length
      },
      filters: {
        locations: [...new Set(mappedJobs.flatMap(job => job.location.split(',').map(item => item.trim()).filter(Boolean)))],
        jobTypes: [...new Set(mappedJobs.map(job => job.jobType).filter(Boolean))]
      },
      jobs: mappedJobs
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerCandidates = async (req, res) => {
  try {
    const query = req.query || {};
    const candidates = await Jobseeker.find({ isDeleted: { $ne: true }, status: { $ne: 'blacklist' } })
      .sort({ createDate: -1 })
      .populate('userId', 'email')
      .populate('qualification', 'name')
      .populate('industryType', 'industryType name industryName')
      .populate('jobCategory', 'categoryName')
      .populate('jobType', 'jobType')
      .populate('currentPlan', 'planName')
      .lean();

    const access = await checkEmployerPlanAccess(req.user._id);
    let unlockedCandidateIds = new Set();
    if (access.hasCandidateAccess && access.employerId) {
      const unlocks = await EmployerResumeUnlock.find({
        employer: access.employerId,
        plan: access.planId,
        isDeleted: { $ne: true }
      }).select('candidate');
      unlockedCandidateIds = new Set(unlocks.map(u => String(u.candidate)));
    }

    let mapped = candidates.map((c, idx) => {
      const isUnlocked = unlockedCandidateIds.has(String(c._id));
      const showContacts = access.hasCandidateAccess && isUnlocked;
      const allowDownload = access.hasCandidateAccess && isUnlocked;
      return mapCandidate(c, idx, showContacts, allowDownload, access.hasCandidateAccess);
    });
    const rawSearch = String(query.search || '').trim().toLowerCase();
    const employmentTypes = splitList(query.employmentTypes);
    const minSalary = nullableNumber(query.minSalary);
    const maxSalary = nullableNumber(query.maxSalary);

    mapped = mapped.filter((candidate) => {
      const searchable = [
        candidate.name,
        candidate.email,
        candidate.phone,
        candidate.location,
        candidate.role,
        candidate.experience,
        candidate.qualification,
        candidate.expectedSalary,
        candidate.industry,
        candidate.gender,
        candidate.employmentType
      ].join(' ').toLowerCase();

      const matchesSearch = !rawSearch || searchable.includes(rawSearch);
      const matchesRole = !query.role || candidate.role === query.role;
      const matchesLocation = !query.location || candidate.location.toLowerCase().includes(String(query.location).toLowerCase());
      const matchesExperience = !query.experience || candidate.experience === query.experience;
      const matchesQualification = !query.qualification || candidate.qualification === query.qualification;
      const matchesMinSalary = minSalary === null || (candidate.salaryMax !== null && candidate.salaryMax >= minSalary);
      const matchesMaxSalary = maxSalary === null || (candidate.salaryMin !== null && candidate.salaryMin <= maxSalary);
      const matchesNotice = !query.notice || candidate.availability === query.notice;
      const matchesEmployment = !employmentTypes.length || employmentTypes.includes(candidate.employmentType);
      const matchesIndustry = !query.industry || candidate.industry === query.industry;
      const matchesGender = !query.gender || candidate.gender === query.gender;
      const matchesCompany = !query.company || candidate.company.toLowerCase().includes(String(query.company).toLowerCase());

      return matchesSearch && matchesRole && matchesLocation && matchesExperience && matchesQualification
        && matchesMinSalary && matchesMaxSalary && matchesNotice && matchesEmployment && matchesIndustry && matchesGender && matchesCompany;
    });

    switch (query.sortBy) {
      case 'Experience (Low to High)':
        mapped.sort((a, b) => a.experienceValue - b.experienceValue);
        break;
      case 'Salary (High to Low)':
        mapped.sort((a, b) => (b.salaryMax || 0) - (a.salaryMax || 0));
        break;
      case 'Salary (Low to High)':
        mapped.sort((a, b) => (a.salaryMin || 0) - (b.salaryMin || 0));
        break;
      case 'Newest First':
        break;
      case 'Experience (High to Low)':
      default:
        mapped.sort((a, b) => b.experienceValue - a.experienceValue);
        break;
    }

    const { items, pagination } = paginate(mapped, query.page, query.limit);

    res.json({
      stats: {
        total: candidates.length,
        availableNow: candidates.filter(item => item.status === 'active').length,
        newThisWeek: mapped.filter(item => item.isRecent).length,
        premiumProfiles: mapped.filter(item => item.isPremium).length,
        activeToday: mapped.filter(item => item.activeToday).length
      },
      filters: {
        roles: [...new Set(candidates.map(item => item.jobCategory?.categoryName).filter(Boolean))],
        locations: [...new Set(candidates.map(item => [item.city, item.state].filter(Boolean).join(', ')).filter(Boolean))],
        experiences: [...new Set(candidates.map(item => item.experience).filter(Boolean))],
        qualifications: [...new Set(candidates.map(item => item.qualification?.name).filter(Boolean))],
        industries: [...new Set(candidates.map(item => item.industryType?.industryType || item.industryType?.name || item.industryType?.industryName).filter(Boolean))],
        employmentTypes: [...new Set(candidates.map(item => item.jobType?.jobType).filter(Boolean))]
      },
      candidates: items,
      pagination
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerCandidateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const candidate = await Jobseeker.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('userId', 'email phone firstName lastName')
      .populate('qualification', 'name')
      .populate('industryType', 'industryType name industryName')
      .populate('jobCategory', 'categoryName')
      .populate('jobType', 'jobType')
      .populate('currentPlan', 'planName')
      .lean();

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found.' });
    }

    const employerJobs = await Job.find({ login: userId, isDeleted: { $ne: true } }).select('_id jobTitle companyName jobType').populate('jobType', 'jobType').lean();
    const employerJobIds = employerJobs.map(job => job._id);
    const [application, talentPoolItem] = await Promise.all([
      Application.findOne({ candidate: candidate._id, job: { $in: employerJobIds } }).populate('job', 'jobTitle companyName jobType').lean(),
      TalentPool.findOne({ employerId: userId, candidateId: candidate._id, isDeleted: { $ne: true } }).lean()
    ]);

    if (!application && !talentPoolItem) {
      return res.status(403).json({ message: 'You are not allowed to view this candidate profile.' });
    }

    const access = await checkEmployerPlanAccess(userId, candidate._id);

    let showContacts = false;
    let allowDownload = false;
    let autoUnlocked = false;

    if (access.hasCandidateAccess) {
      if (access.isUnlocked) {
        showContacts = true;
        allowDownload = true;
      } else if (!access.unlockLimitExhausted) {
        // Automatically unlock!
        await EmployerResumeUnlock.create(addAuditOnCreate(req, {
          employer: access.employerId,
          login: userId,
          candidate: candidate._id,
          plan: access.planId
        }));
        showContacts = true;
        allowDownload = true;
        autoUnlocked = true;
      }
    }

    const mapped = mapCandidate(candidate, 0, showContacts, allowDownload, access.hasCandidateAccess);
    const skills = Array.isArray(candidate.skills) && candidate.skills.length
      ? candidate.skills
      : [candidate.jobCategory?.categoryName, candidate.jobType?.jobType, candidate.industryType?.industryType].filter(Boolean);
    const salary = parseSalaryRange(candidate.expectedSalary);

    res.json({
      ...mapped,
      hasCandidateAccess: access.hasCandidateAccess,
      unlockLimitExhausted: access.unlockLimitExhausted && !showContacts,
      autoUnlocked,
      phone: showContacts ? (candidate.phone || candidate.userId?.phone || '') : mapped.phone,
      designation: candidate.designation || mapped.role,
      bio: candidate.bio || `Experienced ${mapped.role} profile with ${mapped.experience} experience.`,
      expectedSalary: candidate.expectedSalary || 'Not specified',
      currentSalary: salary.min ? `₹ ${salary.min} LPA` : 'Not specified',
      noticePeriod: candidate.status === 'active' ? 'Immediate' : '30 Days',
      relocate: candidate.relocate === 'no' ? 'No' : 'Yes',
      linkedin: candidate.linkedin || '',
      github: candidate.github || '',
      portfolio: candidate.portfolio || '',
      skills,
      frontendSkills: skills.slice(0, 7),
      backendSkills: skills.slice(7, 11),
      toolSkills: ['Git', 'Figma', 'Jira'].filter(Boolean),
      languages: ['English', 'Hindi'],
      education: [{
        degree: candidate.qualification?.name || candidate.studyField || 'Qualification not specified',
        institution: candidate.university || 'Not specified',
        year: candidate.passingYear || 'N/A',
        grade: 'N/A'
      }],
      workExperience: [{
        title: candidate.designation || mapped.role,
        company: candidate.industryType?.industryType || candidate.industryType?.name || 'Previous Company',
        location: mapped.location,
        period: mapped.experience,
        points: [
          candidate.bio || 'Candidate profile details are available for employer review.',
          skills.length ? `Key skills include ${skills.join(', ')}.` : 'Skills not specified.'
        ]
      }],
      certifications: [
        { title: `${mapped.role} Professional Profile`, issuer: 'JobsWaale', year: new Date().getFullYear() }
      ],
      application: application ? {
        id: application._id,
        status: application.status,
        matchScore: application.matchScore || 0,
        appliedDate: application.appliedDate || application.createDate,
        jobTitle: application.job?.jobTitle || ''
      } : null,
      talentPool: talentPoolItem ? {
        id: talentPoolItem._id,
        category: talentPoolItem.category,
        note: talentPoolItem.note
      } : null
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerApplications = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query || {};

    const jobs = await ensureApplicationsExist(userId);
    const jobIds = jobs.map(j => j._id);

    const dbApps = await Application.find({ job: { $in: jobIds } })
      .populate({
        path: 'job',
        populate: [
          { path: 'jobType', select: 'jobType' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .populate({
        path: 'candidate',
        populate: [
          { path: 'userId', select: 'email' },
          { path: 'qualification', select: 'name' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .lean();

    const showContacts = await getEmployerShowContactDetails(userId);
    let applications = dbApps.map((app, index) => {
      const candidate = app.candidate;
      const job = app.job;
      if (!candidate || !job) return null;

      const appliedDate = app.appliedDate || app.createDate || new Date();
      return {
        id: app._id,
        candidateId: candidate._id,
        jobId: job._id,
        name: candidate.name,
        email: showContacts ? (candidate.userId?.email || '') : 'Hidden (Upgrade Plan)',
        phone: showContacts ? (candidate.phone || '') : 'Hidden (Upgrade Plan)',
        location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || 'N/A',
        jobTitle: job.jobTitle || 'Open Position',
        jobStatus: job.status || 'inactive',
        jobType: job.jobType?.jobType || 'Full Time',
        experience: candidate.experience || 'Fresher',
        appliedDate: new Date(appliedDate).toISOString().slice(0, 10),
        displayDate: formatDisplayDate(appliedDate),
        matchScore: app.matchScore || 0,
        status: app.status,
        previousStatus: app.previousStatus || '',
        rejectedFromStatus: app.rejectedFromStatus || (app.status === 'Rejected' ? app.previousStatus || 'Not available' : ''),
        rejectedDate: app.rejectedDate ? formatDisplayDate(app.rejectedDate) : '',
        initials: getInitials(candidate.name).toUpperCase(),
        interviewDetails: app.interviewDetails || null,
        selectionDetails: app.selectionDetails || null
      };
    }).filter(Boolean);

    const rawSearch = String(query.search || '').trim().toLowerCase();
    const applicationsPreStatusFilter = applications.filter((application) => {
      const searchable = [
        application.name,
        application.email,
        application.location,
        application.jobTitle,
        application.jobType,
        application.experience,
        application.status
      ].join(' ').toLowerCase();

      const activityFilter = String(query.applicationActivity || 'active').toLowerCase();
      const isActiveApplication = ['active', 'featured'].includes(String(application.jobStatus || '').toLowerCase());
      const matchesActivity = activityFilter === 'both' || (activityFilter === 'inactive' ? !isActiveApplication : isActiveApplication);
      const matchesSearch = !rawSearch || searchable.includes(rawSearch);
      const matchesJob = !query.jobTitle || application.jobTitle === query.jobTitle;
      const matchesExperience = !query.experience || application.experience === query.experience;
      const matchesDate = !query.appliedAfter || application.appliedDate >= query.appliedAfter;

      let matchesScore = true;
      if (query.minMatchScore) {
        const minScore = parseInt(query.minMatchScore, 10);
        if (!isNaN(minScore)) {
          matchesScore = application.matchScore >= minScore;
        }
      }

      return matchesActivity && matchesSearch && matchesJob && matchesExperience && matchesDate && matchesScore;
    });

    const statusCounts = applicationsPreStatusFilter.reduce((acc, item) => {
      const itemStatus = (item.status === 'Interview' && item.interviewDetails?.onHold) ? 'OnHold' : item.status;
      return { ...acc, [itemStatus]: (acc[itemStatus] || 0) + 1 };
    }, {});

    const filteredApplications = applicationsPreStatusFilter.filter((application) => {
      let matchesStatus = true;
      if (query.status) {
        const appStatus = (application.status === 'Interview' && application.interviewDetails?.onHold) ? 'OnHold' : application.status;
        matchesStatus = appStatus === query.status;
      } else if (query.statusGroup === 'queue') {
        const appStatus = (application.status === 'Interview' && application.interviewDetails?.onHold) ? 'OnHold' : application.status;
        matchesStatus = ['Applied', 'Reviewed'].includes(appStatus);
      }
      return matchesStatus;
    });

    filteredApplications.sort((a, b) => b.appliedDate.localeCompare(a.appliedDate) || b.matchScore - a.matchScore);
    const { items, pagination } = paginate(filteredApplications, query.page, query.limit);

    res.json({
      stats: {
        total: applicationsPreStatusFilter.length,
        applied: statusCounts.Applied || 0,
        reviewed: statusCounts.Reviewed || 0,
        shortlisted: statusCounts.Shortlisted || 0,
        interviews: statusCounts.Interview || 0,
        onHold: statusCounts.OnHold || 0,
        selected: statusCounts.Offered || statusCounts.Hired || 0,
        rejected: statusCounts.Rejected || 0
      },
      pipeline: {
        applied: statusCounts.Applied || 0,
        reviewed: statusCounts.Reviewed || 0,
        shortlisted: statusCounts.Shortlisted || 0,
        interview: statusCounts.Interview || 0,
        onHold: statusCounts.OnHold || 0,
        offered: statusCounts.Offered || statusCounts.Hired || 0,
        rejected: statusCounts.Rejected || 0
      },
      filters: {
        jobTitles: [...new Set(jobs.map(job => job.jobTitle).filter(Boolean))],
        experiences: [...new Set(applicationsPreStatusFilter.map(item => item.experience).filter(Boolean))]
      },
      applications: items,
      pagination
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerApplicantHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query || {};

    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .select('_id jobTitle companyName status jobExpiry city state')
      .lean();
    const jobIds = jobs.map(job => job._id);

    const dbApps = await Application.find({ job: { $in: jobIds } })
      .populate({
        path: 'job',
        select: 'jobTitle companyName status jobExpiry city state'
      })
      .populate({
        path: 'candidate',
        populate: [
          { path: 'userId', select: 'email phone firstName lastName' },
          { path: 'qualification', select: 'name' }
        ]
      })
      .sort({ appliedDate: -1, createDate: -1 })
      .lean();

    const showContacts = await getEmployerShowContactDetails(userId);
    let applicants = dbApps.map((app) => {
      const candidate = app.candidate;
      const job = app.job;
      if (!candidate || !job) return null;
      const appliedDate = app.appliedDate || app.createDate;

      return {
        id: app._id,
        applicationId: app._id,
        candidateId: candidate._id,
        name: candidate.name || [candidate.userId?.firstName, candidate.userId?.lastName].filter(Boolean).join(' ') || 'Jobseeker',
        email: showContacts ? (candidate.userId?.email || '') : 'Hidden (Upgrade Plan)',
        phone: showContacts ? (candidate.phone || candidate.userId?.phone || '') : 'Hidden (Upgrade Plan)',
        qualification: candidate.qualification?.name || '',
        experience: candidate.experience || '',
        location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || '',
        jobId: job._id,
        jobTitle: job.jobTitle || 'Job',
        jobStatus: job.status || '',
        jobExpiry: job.jobExpiry || null,
        status: app.status || 'Applied',
        matchScore: app.matchScore || 0,
        appliedDate,
        appliedDisplayDate: appliedDate ? new Date(appliedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'
      };
    }).filter(Boolean);

    const rawSearch = String(query.search || '').trim().toLowerCase();
    applicants = applicants.filter((item) => {
      const matchesSearch = !rawSearch || [
        item.name,
        item.email,
        item.phone,
        item.jobTitle,
        item.status,
        item.location,
        item.experience
      ].join(' ').toLowerCase().includes(rawSearch);
      const matchesJob = !query.jobId || String(item.jobId) === String(query.jobId);
      const matchesStatus = !query.status || item.status === query.status;
      return matchesSearch && matchesJob && matchesStatus;
    });

    const statusCounts = applicants.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});

    const total = applicants.length;
    const page = Math.max(1, parseInt(query.page) || 1);
    const limit = Math.max(1, parseInt(query.limit) || 10);
    const startIndex = (page - 1) * limit;
    const totalPages = Math.ceil(total / limit);

    const paginatedApplicants = applicants.slice(startIndex, startIndex + limit);

    res.json({
      stats: {
        total,
        applied: statusCounts.Applied || 0,
        shortlisted: statusCounts.Shortlisted || 0,
        interview: statusCounts.Interview || 0,
        offered: statusCounts.Offered || 0,
        rejected: statusCounts.Rejected || 0
      },
      filters: {
        jobs: jobs.map(job => ({ id: job._id, title: job.jobTitle }))
      },
      applicants: paginatedApplicants,
      pagination: {
        page,
        limit,
        total,
        totalPages
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerApplicationDetails = async (req, res) => {
  try {
    const { id } = req.params;

    const appDoc = await Application.findById(id).populate('job', 'login');
    if (!appDoc) {
      return res.status(404).json({ message: 'Application not found.' });
    }
    if (String(appDoc.job?.login) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not allowed to view this application.' });
    }

    const candidateId = appDoc.candidate;
    const access = await checkEmployerPlanAccess(req.user._id, candidateId);

    if (!access.hasCandidateAccess) {
      return res.status(403).json({ message: 'Viewing candidate profiles is not supported under your current plan.' });
    }

    if (!access.isUnlocked) {
      if (access.unlockLimitExhausted) {
        return res.status(403).json({
          message: `Your plan's resume unlock limit is exhausted. Please upgrade your plan to view more candidates.`
        });
      }

      await EmployerResumeUnlock.create(addAuditOnCreate(req, {
        employer: access.employerId,
        login: req.user._id,
        candidate: candidateId,
        plan: access.planId
      }));
    }

    if (appDoc.status === 'Applied') {
      appDoc.status = 'Reviewed';
      appDoc.previousStatus = 'Applied';
      await appDoc.save();
    }

    const application = await Application.findById(id)
      .populate({
        path: 'job',
        populate: [
          { path: 'jobType', select: 'jobType' },
          { path: 'jobCategory', select: 'categoryName' },
          { path: 'qualification', select: 'name' }
        ]
      })
      .populate({
        path: 'candidate',
        populate: [
          { path: 'userId', select: 'email phone firstName lastName' },
          { path: 'qualification', select: 'name' },
          { path: 'jobCategory', select: 'categoryName' },
          { path: 'jobType', select: 'jobType' },
          { path: 'industryType', select: 'industryType' }
        ]
      })
      .lean();

    if (!application || !application.job || !application.candidate) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    const showContacts = await getEmployerShowContactDetails(req.user._id);
    const allowDownload = await getEmployerAllowResumeDownload(req.user._id);
    const candidate = application.candidate;
    const job = application.job;
    const appliedDate = application.appliedDate || application.createDate || new Date();
    const salaryRange = parseSalaryRange(candidate.expectedSalary || job.salary || '');
    const skills = Array.isArray(candidate.skills) && candidate.skills.length
      ? candidate.skills
      : [job.jobCategory?.categoryName, job.jobType?.jobType, candidate.experience].filter(Boolean);

    res.json({
      id: application._id,
      status: application.status,
      matchScore: application.matchScore || 0,
      appliedDate,
      appliedDisplayDate: formatDisplayDate(appliedDate),
      shortlistedDate: application.shortlistedDate || null,
      previousStatus: application.previousStatus || '',
      rejectedFromStatus: application.rejectedFromStatus || (application.status === 'Rejected' ? application.previousStatus || 'Not available' : ''),
      rejectedDate: application.rejectedDate || null,
      rejectedDisplayDate: application.rejectedDate ? formatDisplayDate(application.rejectedDate) : '',
      interviewDetails: application.interviewDetails || null,
      selectionDetails: application.selectionDetails || null,
      candidate: {
        id: candidate._id,
        name: candidate.name,
        email: showContacts ? (candidate.userId?.email || '') : 'Hidden (Upgrade Plan)',
        phone: showContacts ? (candidate.phone || candidate.userId?.phone || '') : 'Hidden (Upgrade Plan)',
        initials: getInitials(candidate.name).toUpperCase(),
        designation: candidate.designation || candidate.jobCategory?.categoryName || job.jobTitle || 'Candidate',
        location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || 'N/A',
        experience: candidate.experience || 'Fresher',
        qualification: candidate.qualification?.name || 'Not specified',
        industry: candidate.industryType?.industryType || '',
        expectedSalary: candidate.expectedSalary || 'Not specified',
        currentSalary: salaryRange.min ? `₹ ${salaryRange.min} LPA` : 'Not specified',
        noticePeriod: candidate.noticePeriod || 'Immediate',
        relocate: candidate.relocate === 'no' ? 'No' : 'Yes',
        resume: allowDownload ? (candidate.resume || '') : '',
        hasResume: Boolean(candidate.resume),
        allowResumeDownload: allowDownload,
        bio: candidate.bio || '',
        skills,
        education: [{
          degree: candidate.qualification?.name || candidate.studyField || 'Qualification not specified',
          institution: candidate.university || 'Not specified',
          year: candidate.passingYear || 'N/A',
          grade: 'N/A'
        }],
        workExperience: [{
          title: candidate.designation || candidate.jobCategory?.categoryName || 'Candidate',
          company: candidate.industryType?.industryType || 'Previous Company',
          period: candidate.experience || 'N/A',
          points: [
            candidate.bio || 'Candidate profile details are available in the jobseeker profile.',
            skills.length ? `Key skills: ${skills.join(', ')}` : 'Skills not specified.'
          ]
        }]
      },
      job: {
        id: job._id,
        title: job.jobTitle,
        company: job.companyName,
        type: job.jobType?.jobType || job.workMode || 'Full Time',
        category: job.jobCategory?.categoryName || '',
        experience: job.experience || '',
        salary: job.salary || (job.minSalary && job.maxSalary ? `₹${job.minSalary} - ${job.maxSalary}` : 'Not specified'),
        location: [job.city, job.state].filter(Boolean).join(', ') || 'N/A'
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.downloadCandidateResume = async (req, res) => {
  try {
    const candidateId = req.params.id;

    const candidate = await Jobseeker.findOne({ _id: candidateId, isDeleted: { $ne: true } }).select('resume name');
    if (!candidate?.resume) {
      return res.status(404).json({ message: 'Resume was not found for this candidate.' });
    }

    const filename = path.basename(candidate.resume);
    const attachment = await Attachment.findOne({ filename });
    if (attachment) {
      res.setHeader('Content-Type', attachment.mimeType || 'application/octet-stream');
      res.setHeader('Content-Length', attachment.size || attachment.data.length);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      return res.send(attachment.data);
    }

    const localPath = path.join(__dirname, '..', candidate.resume.replace(/^\/+/, ''));
    if (fs.existsSync(localPath)) {
      return res.download(localPath, filename);
    }

    return res.status(404).json({ message: 'Resume file could not be found.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerInterviews = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query || {};

    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .select('_id jobTitle jobType contactPerson')
      .populate('jobType', 'jobType')
      .lean();
    const jobIds = jobs.map(job => job._id);

    if (!jobIds.length) {
      return res.json({
        stats: { total: 0, scheduled: 0, onHold: 0, completed: 0, rescheduled: 0, cancelled: 0 },
        filters: { jobTitles: [], types: [] },
        interviews: [],
        pagination: { page: 1, limit: Number(query.limit) || 10, total: 0, totalPages: 1 }
      });
    }

    const dbApps = await Application.find({ job: { $in: jobIds }, status: { $in: ['Shortlisted', 'Interview'] } })
      .populate({
        path: 'job',
        populate: [
          { path: 'jobType', select: 'jobType' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .populate({
        path: 'candidate',
        populate: [
          { path: 'userId', select: 'email' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .lean();

    const normalizeInterviewType = (type) => {
      if (type === 'Phone Call') return 'Telephonic';
      return type || 'Other';
    };

    const showContacts = await getEmployerShowContactDetails(userId);
    const interviews = dbApps.map((app, index) => {
      const candidate = app.candidate;
      const job = app.job;
      if (!candidate || !job) return null;

      const details = app.interviewDetails || {};
      if (details.status === 'Completed' || details.status === 'Cancelled') return null; // Exclude Completed/Cancelled

      let interviewStatus = 'Scheduled';
      if (app.status === 'Shortlisted') {
        interviewStatus = 'Pending Interview';
      } else if (details.onHold || details.status === 'On Hold') {
        interviewStatus = 'On Hold';
      } else {
        interviewStatus = details.status || 'Scheduled';
      }
      const interviewDate = details.date || (interviewStatus === 'Pending Interview' || interviewStatus === 'On Hold' ? null : (app.updateDate || app.appliedDate));

      return {
        id: app._id,
        applicationId: app._id,
        candidateId: candidate._id,
        jobId: job._id,
        name: candidate.name,
        email: showContacts ? (candidate.userId?.email || '') : 'Hidden (Upgrade Plan)',
        phone: showContacts ? (candidate.phone || '') : 'Hidden (Upgrade Plan)',
        location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || 'N/A',
        jobTitle: job.jobTitle || 'Open Position',
        jobType: job.jobType?.jobType || 'Full Time',
        type: normalizeInterviewType(details.type),
        interviewDate: interviewDate ? new Date(interviewDate).toISOString().slice(0, 10) : '',
        displayDate: formatDisplayDate(interviewDate),
        time: details.time || '',
        interviewer: details.interviewer || job.contactPerson || req.user.firstName || req.user.companyName || 'Interviewer',
        locationOrLink: details.locationOrLink || '',
        notes: details.notes || '',
        status: interviewStatus,
        initials: getInitials(candidate.name).toUpperCase(),
        avatarTone: ['from-rose-200 to-amber-200', 'from-blue-200 to-red-200', 'from-pink-200 to-slate-300', 'from-yellow-200 to-orange-200', 'from-amber-200 to-emerald-200', 'from-sky-200 to-slate-200', 'from-purple-200 to-pink-200'][index % 7],
        interviewerTone: index % 2 ? 'from-orange-200 to-slate-300' : 'from-emerald-200 to-pink-200'
      };
    }).filter(Boolean);

    const stats = interviews.reduce((acc, item) => {
      const key = item.status === 'Pending Interview' ? 'pending' : (item.status === 'On Hold' ? 'onHold' : 'scheduled');
      return { ...acc, total: acc.total + 1, [key]: (acc[key] || 0) + 1 };
    }, { total: 0, pending: 0, scheduled: 0, onHold: 0 });

    const rawSearch = String(query.search || '').trim().toLowerCase();
    const normalizedType = query.type === 'Telephonic' ? 'Telephonic' : query.type;
    let filtered = interviews.filter((interview) => {
      const searchable = [
        interview.name,
        interview.email,
        interview.phone,
        interview.jobTitle,
        interview.jobType,
        interview.type,
        interview.interviewer,
        interview.status
      ].join(' ').toLowerCase();

      return (!rawSearch || searchable.includes(rawSearch))
        && (!query.jobTitle || interview.jobTitle === query.jobTitle)
        && (!query.status || interview.status === query.status)
        && (!normalizedType || interview.type === normalizedType)
        && (!query.fromDate || interview.interviewDate >= query.fromDate);
    });

    filtered.sort((a, b) => b.interviewDate.localeCompare(a.interviewDate) || String(b.time).localeCompare(String(a.time)));
    const { items, pagination } = paginate(filtered, query.page, query.limit);

    res.json({
      stats,
      filters: {
        jobTitles: [...new Set(interviews.map(item => item.jobTitle).filter(Boolean))],
        types: [...new Set(interviews.map(item => item.type).filter(Boolean))]
      },
      interviews: items,
      pagination
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerSelected = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query || {};

    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .select('_id jobTitle jobType minSalary maxSalary salary salaryUnit')
      .populate('jobType', 'jobType')
      .lean();
    const jobIds = jobs.map(job => job._id);

    if (!jobIds.length) {
      return res.json({
        stats: { total: 0, selected: 0, offerSent: 0, offerAccepted: 0, hired: 0, offerDeclined: 0 },
        filters: { jobTitles: [] },
        selected: [],
        pagination: { page: 1, limit: Number(query.limit) || 10, total: 0, totalPages: 1 }
      });
    }

    const dbApps = await Application.find({ job: { $in: jobIds }, status: 'Offered' })
      .populate({
        path: 'job',
        populate: [
          { path: 'jobType', select: 'jobType' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .populate({
        path: 'candidate',
        populate: [
          { path: 'userId', select: 'email' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .lean();

    const getSalaryLpa = (app) => {
      const detailsSalary = app.selectionDetails?.salaryOffered;
      if (detailsSalary !== null && detailsSalary !== undefined && detailsSalary !== '') {
        const salary = Number(detailsSalary);
        return salary > 100 ? Number((salary / 100000).toFixed(1)) : salary;
      }
      const job = app.job || {};
      if (job.maxSalary) return Number((Number(job.maxSalary) / 100000).toFixed(1));
      if (job.minSalary) return Number((Number(job.minSalary) / 100000).toFixed(1));
      const parsed = parseSalaryRange(job.salary || '');
      if (parsed.max) return parsed.max > 100 ? Number((parsed.max / 100000).toFixed(1)) : parsed.max;
      return null;
    };

    const showContacts = await getEmployerShowContactDetails(userId);
    const selectedRows = dbApps.map((app, index) => {
      const candidate = app.candidate;
      const job = app.job;
      if (!candidate || !job) return null;

      const details = app.selectionDetails || {};
      const selectedDate = details.selectedDate || app.updateDate || app.appliedDate;
      const offerStatus = details.offerStatus || 'Selected';
      const salaryLpa = getSalaryLpa(app);

      return {
        id: app._id,
        applicationId: app._id,
        candidateId: candidate._id,
        jobId: job._id,
        name: candidate.name,
        email: showContacts ? (candidate.userId?.email || '') : 'Hidden (Upgrade Plan)',
        phone: showContacts ? (candidate.phone || '') : 'Hidden (Upgrade Plan)',
        location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || 'N/A',
        jobTitle: job.jobTitle || 'Open Position',
        jobType: details.employmentType || job.jobType?.jobType || 'Full Time',
        selectionDate: selectedDate ? new Date(selectedDate).toISOString().slice(0, 10) : '',
        displayDate: formatDisplayDate(selectedDate),
        interviewScore: details.interviewScore ?? app.matchScore ?? 0,
        offerStatus,
        salaryOffered: salaryLpa,
        salaryText: salaryLpa !== null ? `Rs. ${salaryLpa} LPA` : 'Not added',
        joiningDate: details.joiningDate ? formatDate(details.joiningDate) : null,
        initials: getInitials(candidate.name).toUpperCase(),
        avatarTone: ['from-rose-200 to-amber-200', 'from-blue-200 to-red-200', 'from-pink-200 to-slate-300', 'from-yellow-200 to-orange-200', 'from-amber-200 to-emerald-200', 'from-sky-200 to-slate-200', 'from-purple-200 to-pink-200'][index % 7]
      };
    }).filter(Boolean);

    const stats = selectedRows.reduce((acc, item) => {
      if (item.offerStatus === 'Selected') acc.selected += 1;
      if (item.offerStatus === 'Offer Sent') acc.offerSent += 1;
      if (item.offerStatus === 'Offer Accepted') acc.offerAccepted += 1;
      if (item.offerStatus === 'Hired') acc.hired += 1;
      if (item.offerStatus === 'Offer Declined') acc.offerDeclined += 1;
      return { ...acc, total: acc.total + 1 };
    }, { total: 0, selected: 0, offerSent: 0, offerAccepted: 0, hired: 0, offerDeclined: 0 });

    const rawSearch = String(query.search || '').trim().toLowerCase();
    const minSalary = query.minSalary ? Number(query.minSalary) : null;
    let filtered = selectedRows.filter((item) => {
      const searchable = [
        item.name,
        item.email,
        item.phone,
        item.location,
        item.jobTitle,
        item.jobType,
        item.offerStatus
      ].join(' ').toLowerCase();

      return (!rawSearch || searchable.includes(rawSearch))
        && (!query.jobTitle || item.jobTitle === query.jobTitle)
        && (!query.status || item.offerStatus === query.status)
        && (!query.selectionDate || item.selectionDate >= query.selectionDate)
        && (!minSalary || (item.salaryOffered !== null && item.salaryOffered >= minSalary));
    });

    filtered.sort((a, b) => b.selectionDate.localeCompare(a.selectionDate) || b.interviewScore - a.interviewScore);
    const { items, pagination } = paginate(filtered, query.page, query.limit);

    res.json({
      stats,
      filters: {
        jobTitles: [...new Set(selectedRows.map(item => item.jobTitle).filter(Boolean))]
      },
      selected: items,
      pagination
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerReports = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query || {};
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const requestedFrom = query.from ? new Date(query.from) : defaultFrom;
    const requestedTo = query.to ? new Date(query.to) : now;
    const fromDate = Number.isNaN(requestedFrom.getTime()) ? defaultFrom : requestedFrom;
    const toDate = Number.isNaN(requestedTo.getTime()) ? now : requestedTo;
    fromDate.setHours(0, 0, 0, 0);
    toDate.setHours(23, 59, 59, 999);
    if (fromDate > toDate) {
      const originalFrom = new Date(fromDate);
      const originalTo = new Date(toDate);
      fromDate.setTime(originalTo.getTime());
      fromDate.setHours(0, 0, 0, 0);
      toDate.setTime(originalFrom.getTime());
      toDate.setHours(23, 59, 59, 999);
    }

    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).lean();

    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName || req.user.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };

    const jobs = await Job.find({ ...ownershipFilter, isDeleted: { $ne: true } })
      .select('_id jobTitle jobType postingDate jobExpiry status publishStatus')
      .populate('jobType', 'jobType')
      .lean();
    const selectedJobId = String(query.jobId || 'all');
    const selectedJobs = selectedJobId !== 'all'
      ? jobs.filter(job => String(job._id) === selectedJobId)
      : jobs;
    const jobIds = selectedJobs.map(job => job._id);
    const statusFilter = String(query.status || 'all');

    if (!jobIds.length) {
      return res.json({
        range: { from: formatDate(fromDate), to: formatDate(toDate), label: 'No jobs found' },
        stats: { totalApplications: 0, shortlisted: 0, interviews: 0, offersMade: 0, hires: 0, rejectionRate: 0 },
        monthlyOverview: [],
        sources: [],
        funnel: [],
        recentActivity: [],
        topJobs: [],
        pipeline: { applied: 0, shortlisted: 0, interview: 0, onHold: 0, selected: 0, offered: 0, rejected: 0 },
        comparison: {},
        filters: {
          jobs: jobs.map(job => ({ id: job._id, title: job.jobTitle })),
          statuses: []
        },
        history: []
      });
    }

    await ensureApplicationsExist(userId);

    const dateFieldFilter = (start, end) => ({
      job: { $in: jobIds },
      $or: [
        { appliedDate: { $gte: start, $lte: end } },
        {
          $and: [
            { $or: [{ appliedDate: { $exists: false } }, { appliedDate: null }] },
            { createDate: { $gte: start, $lte: end } }
          ]
        }
      ]
    });

    const rangeDuration = toDate.getTime() - fromDate.getTime() + 1;
    const previousToDate = new Date(fromDate.getTime() - 1);
    const previousFromDate = new Date(previousToDate.getTime() - rangeDuration + 1);
    previousFromDate.setHours(0, 0, 0, 0);
    previousToDate.setHours(23, 59, 59, 999);

    const [apps, previousApps, allApps] = await Promise.all([
      Application.find(dateFieldFilter(fromDate, toDate))
        .populate({
          path: 'candidate',
          populate: { path: 'userId', select: 'email' }
        })
        .populate('job', 'jobTitle jobType')
        .lean(),
      Application.find(dateFieldFilter(previousFromDate, previousToDate)).lean(),
      Application.find({ job: { $in: jobIds } }).lean()
    ]);

    const sourceLabel = (app) => app.source || app.candidate?.source || app.candidate?.registrationSource || app.candidate?.leadSource || 'Other';
    const getLogicalStage = (app) => {
      if (app.status === 'Interview' && app.interviewDetails?.onHold === true) return 'onHold';
      if (app.status === 'Interview') return 'interview';
      if (app.status === 'Offered' && app.selectionDetails?.offerStatus === 'Selected') return 'selected';
      if (app.status === 'Offered') return 'offered';
      if (app.status === 'Applied') return 'applied';
      if (app.status === 'Reviewed') return 'reviewed';
      if (app.status === 'Shortlisted') return 'shortlisted';
      if (app.status === 'Rejected') return 'rejected';
      return 'applied';
    };
    const stageLabels = {
      applied: 'Applied',
      reviewed: 'Reviewed',
      shortlisted: 'Shortlisted',
      interview: 'Interview',
      onHold: 'On Hold',
      selected: 'Selected',
      offered: 'Offered',
      rejected: 'Rejected'
    };
    const statusOptions = [
      { key: 'applied', label: 'Applied' },
      { key: 'reviewed', label: 'Reviewed' },
      { key: 'shortlisted', label: 'Shortlisted' },
      { key: 'interview', label: 'Interview' },
      { key: 'onHold', label: 'On Hold' },
      { key: 'selected', label: 'Selected' },
      { key: 'offered', label: 'Offered' },
      { key: 'rejected', label: 'Rejected' }
    ];
    const matchesStatus = (app) => statusFilter === 'all' || getLogicalStage(app) === statusFilter;
    const filteredApps = apps.filter(matchesStatus);
    const filteredPreviousApps = previousApps.filter(matchesStatus);
    const filteredAllApps = allApps.filter(matchesStatus);

    const summarizeApps = (items) => {
      const pipeline = { applied: 0, shortlisted: 0, interview: 0, onHold: 0, selected: 0, offered: 0, rejected: 0 };
      let reviewed = 0;
      items.forEach((app) => {
        const stage = getLogicalStage(app);
        if (stage === 'reviewed') reviewed += 1;
        if (pipeline[stage] !== undefined) pipeline[stage] += 1;
      });
      const rejected = pipeline.rejected;
      const totalApplications = items.length;
      const hires = items.filter(app => app.status === 'Offered' && app.selectionDetails?.offerStatus === 'Hired').length;
      return {
        stats: {
          totalApplications,
          shortlisted: pipeline.shortlisted,
          interviews: pipeline.interview,
          offersMade: pipeline.offered,
          hires,
          rejectionRate: totalApplications ? Math.round((rejected / totalApplications) * 100) : 0
        },
        pipeline,
        reviewed
      };
    };

    const currentSummary = summarizeApps(filteredApps);
    const previousSummary = summarizeApps(filteredPreviousApps);
    const allTimeSummary = summarizeApps(filteredAllApps);

    const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short', year: '2-digit' });
    const monthKeys = [];
    const cursor = new Date(fromDate.getFullYear(), fromDate.getMonth(), 1);
    const lastMonth = new Date(toDate.getFullYear(), toDate.getMonth(), 1);
    while (cursor <= lastMonth) {
      monthKeys.push({
        key: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`,
        label: monthFormatter.format(cursor)
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    const emptyMonth = () => ({ applied: 0, reviewed: 0, shortlisted: 0, interview: 0, onHold: 0, selected: 0, offered: 0, rejected: 0 });
    const monthlyMap = Object.fromEntries(monthKeys.map(item => [item.key, emptyMonth()]));
    const sourceMap = {};
    const jobMap = Object.fromEntries(selectedJobs.map(job => [String(job._id), {
      id: job._id,
      title: job.jobTitle,
      applications: 0,
      shortlisted: 0,
      interviews: 0,
      hired: 0
    }]));

    filteredApps.forEach((app) => {
      const date = new Date(app.appliedDate || app.createDate || now);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const month = monthlyMap[monthKey];
      const stage = getLogicalStage(app);
      if (month && month[stage] !== undefined) month[stage] += 1;

      const source = sourceLabel(app);
      sourceMap[source] = (sourceMap[source] || 0) + 1;

      const jobStats = jobMap[String(app.job?._id || app.job)];
      if (jobStats) {
        jobStats.applications += 1;
        if (stage === 'shortlisted') jobStats.shortlisted += 1;
        if (stage === 'interview') jobStats.interviews += 1;
        if (app.status === 'Offered' && app.selectionDetails?.offerStatus === 'Hired') jobStats.hired += 1;
      }
    });

    const stats = currentSummary.stats;
    const totalApplications = stats.totalApplications;
    const offersMade = stats.offersMade;
    const hires = stats.hires;

    const monthlyOverview = monthKeys.map(item => ({ month: item.label, ...monthlyMap[item.key] }));
    const sources = Object.entries(sourceMap)
      .map(([name, value]) => ({ name, value, percent: totalApplications ? Number(((value / totalApplications) * 100).toFixed(1)) : 0 }))
      .sort((a, b) => b.value - a.value);

    const funnel = [
      { key: 'applied', title: 'Applied', value: totalApplications },
      { key: 'shortlisted', title: 'Shortlisted', value: stats.shortlisted },
      { key: 'interviewed', title: 'Interviewed', value: stats.interviews },
      { key: 'offered', title: 'Offered', value: offersMade },
      { key: 'hired', title: 'Hired', value: hires }
    ].map(item => ({ ...item, percent: totalApplications ? Number(((item.value / totalApplications) * 100).toFixed(1)) : 0 }));

    const recentApps = [...filteredApps]
      .sort((a, b) => new Date(b.updateDate || b.appliedDate) - new Date(a.updateDate || a.appliedDate))
      .slice(0, 6);
    const recentActivity = recentApps.map((app) => {
      const statusTitle = {
        Applied: 'New Application Received',
        Shortlisted: 'Candidate Shortlisted',
        Interview: 'Interview Scheduled',
        Offered: app.selectionDetails?.offerStatus === 'Hired' ? 'Candidate Hired' : 'Offer Made',
        Rejected: 'Candidate Rejected',
        Reviewed: 'Application Reviewed'
      };
      return {
        id: app._id,
        type: app.status,
        title: statusTitle[app.status] || 'Application Updated',
        description: `${app.candidate?.name || 'Candidate'} - ${app.job?.jobTitle || 'Open Position'}`,
        time: formatDisplayDate(app.updateDate || app.appliedDate)
      };
    });

    const topJobs = Object.values(jobMap)
      .filter(job => job.applications > 0)
      .sort((a, b) => b.applications - a.applications)
      .slice(0, 5)
      .map(job => ({
        ...job,
        interviewRate: job.applications ? Math.round((job.interviews / job.applications) * 100) : 0,
        conversionRate: job.applications ? Number(((job.hired / job.applications) * 100).toFixed(1)) : 0
      }));

    const comparison = Object.fromEntries(Object.keys(stats).map((key) => {
      const currentValue = Number(stats[key] || 0);
      const previousValue = Number(previousSummary.stats[key] || 0);
      const change = currentValue - previousValue;
      const percent = previousValue ? Number(((change / previousValue) * 100).toFixed(1)) : (currentValue ? 100 : 0);
      return [key, { current: currentValue, previous: previousValue, change, percent }];
    }));
    const history = [...filteredApps]
      .sort((a, b) => new Date(b.appliedDate || b.createDate || 0) - new Date(a.appliedDate || a.createDate || 0))
      .slice(0, 100)
      .map((app) => {
        const stage = getLogicalStage(app);
        return {
          id: app._id,
          candidateName: app.candidate?.name || [app.candidate?.userId?.firstName, app.candidate?.userId?.lastName].filter(Boolean).join(' ') || 'Candidate',
          email: app.candidate?.userId?.email || app.candidate?.email || '',
          jobTitle: app.job?.jobTitle || 'Open Position',
          status: stageLabels[stage] || app.status || 'Applied',
          statusKey: stage,
          appliedDate: formatDisplayDate(app.appliedDate || app.createDate),
          updatedDate: formatDisplayDate(app.updateDate || app.appliedDate || app.createDate),
          source: sourceLabel(app)
        };
      });

    res.json({
      range: {
        from: formatDate(fromDate),
        to: formatDate(toDate),
        label: `${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}`,
        previousLabel: `${formatDisplayDate(previousFromDate)} - ${formatDisplayDate(previousToDate)}`
      },
      stats,
      monthlyOverview,
      sources,
      funnel,
      recentActivity,
      topJobs,
      pipeline: currentSummary.pipeline,
      comparison,
      filters: {
        jobs: jobs.map(job => ({ id: job._id, title: job.jobTitle })),
        statuses: statusOptions
      },
      history,
      dashboardSnapshot: {
        stats: allTimeSummary.stats,
        pipeline: allTimeSummary.pipeline
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerJobDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const allowDownload = await getEmployerAllowResumeDownload(userId);
    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).lean();
    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName || req.user.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };

    const job = await Job.findOne({ _id: req.params.id, ...ownershipFilter, isDeleted: { $ne: true } })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .populate('qualification', 'name')
      .lean();

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    const status = getJobDisplayStatus(job);

    const dbApps = await Application.find({ job: job._id }).lean();
    
    let applications = dbApps.length;
    let applied = 0;
    let reviewed = 0;
    let shortlisted = 0;
    let interviews = 0;
    let onHold = 0;
    let selected = 0;
    let rejected = 0;
    let matchScoreTotal = 0;
    let matchScoreCount = 0;

    dbApps.forEach(app => {
      const details = app.interviewDetails || {};
      let logicalStatus = app.status || 'Applied';
      if (logicalStatus === 'Interview' && details.onHold) {
        logicalStatus = 'OnHold';
      }
      const matchScore = Number(app.matchScore);
      if (Number.isFinite(matchScore)) {
        matchScoreTotal += matchScore;
        matchScoreCount += 1;
      }
      
      if (logicalStatus === 'Rejected') {
        rejected += 1;
      } else if (logicalStatus === 'Offered' || logicalStatus === 'Hired') {
        selected += 1;
      } else if (logicalStatus === 'Interview') {
        interviews += 1;
      } else if (logicalStatus === 'OnHold') {
        onHold += 1;
      } else if (logicalStatus === 'Shortlisted') {
        shortlisted += 1;
      } else if (logicalStatus === 'Reviewed') {
        reviewed += 1;
      } else if (logicalStatus === 'Applied') {
        applied += 1;
      }
    });
    
    const views = job.views || 0;
    const impressions = job.impressions || 0;
    const averageMatchScore = matchScoreCount ? Math.round(matchScoreTotal / matchScoreCount) : 0;

    const latestApps = await Application.find({ job: job._id })
      .populate({
        path: 'candidate',
        select: 'name phone userId city state preferredLocation experience resume',
        populate: { path: 'userId', select: 'email phone firstName lastName' }
      })
      .sort({ appliedDate: -1, createDate: -1 })
      .lean();

    res.json({
      id: job._id,
      title: job.jobTitle,
      status,
      rawStatus: job.status,
      publishStatus: job.publishStatus,
      postDate: formatDate(job.createDate || job.postingDate),
      expiry: formatDate(job.jobExpiry),
      remainingDays: daysFromToday(job.jobExpiry),
      views,
      impressions,
      location: getJobLocationText(job),
      jobType: job.jobType?.jobType || 'N/A',
      category: job.jobCategory?.categoryName || 'N/A',
      qualification: job.qualification?.name || '',
      experience: job.requiredExperience || job.experience || '',
      salary: job.salary || (job.minSalary || job.maxSalary ? `Rs. ${job.minSalary || 0} - Rs. ${job.maxSalary || 0} ${job.salaryUnit || ''}`.trim() : 'Salary not specified'),
      vacancies: job.vacancies || 0,
      companyName: job.companyName || 'Employer',
      contactPerson: job.contactPerson || '',
      email: job.email || '',
      phone: job.phone || '',
      description: job.description || job.jobSummary || '',
      responsibilities: job.responsibilities || '',
      skills: job.skills || [],
      languages: job.languages || [],
      benefits: job.benefits || '',
      noticePeriod: job.noticePeriod || '',
      shiftTiming: job.shiftTiming || '',
      workMode: job.workMode || '',
      form: {
        jobTitle: job.jobTitle || '',
        jobCategory: job.jobCategory?._id || job.jobCategory || '',
        jobType: job.jobType?._id || job.jobType || '',
        vacancies: job.vacancies || '',
        workMode: job.workMode || 'Office',
        jobLocations: job.jobLocations || [],
        description: job.description || '',
        jobSummary: job.jobSummary || '',
        detailedDescription: job.detailedDescription || '',
        responsibilities: job.responsibilities || '',
        qualification: job.qualification?._id || job.qualification || '',
        experience: job.experience || '',
        requiredExperience: job.requiredExperience || '',
        salary: job.salary || '',
        minSalary: job.minSalary,
        maxSalary: job.maxSalary,
        salaryUnit: job.salaryUnit || 'P.A.',
        salaryNegotiable: job.salaryNegotiable,
        noticePeriod: job.noticePeriod || '',
        joiningDate: formatDate(job.joiningDate),
        shiftTiming: job.shiftTiming || '',
        jobExpiry: formatDate(job.jobExpiry),
        benefits: job.benefits || '',
        aboutCompany: job.aboutCompany || '',
        skills: job.skills || [],
        languages: job.languages || [],
        candidateLocationPreference: job.candidateLocationPreference || '',
        screeningQuestions: job.screeningQuestions || '',
        publishStatus: job.publishStatus || 'publish',
        country: job.country || '',
        state: job.state || '',
        district: job.district || '',
        city: job.city || ''
      },
      stats: {
        applications,
        applied,
        reviewed,
        shortlisted,
        interviews,
        onHold,
        selected,
        rejected,
        averageMatchScore
      },
      recentApplicants: latestApps.map((app, index) => ({
        id: app._id,
        candidateId: app.candidate?._id || '',
        name: app.candidate?.name || [app.candidate?.userId?.firstName, app.candidate?.userId?.lastName].filter(Boolean).join(' ') || 'N/A',
        email: app.candidate?.userId?.email || app.candidate?.phone || app.candidate?.userId?.phone || '',
        location: [app.candidate?.city, app.candidate?.state].filter(Boolean).join(', ') || app.candidate?.preferredLocation || '',
        experience: app.candidate?.experience || '',
        appliedAt: formatDate(app.appliedDate || app.createDate),
        matchScore: app.matchScore || 0,
        status: app.status,
        interviewDetails: app.interviewDetails || null,
        selectionDetails: app.selectionDetails || null,
        hasResume: Boolean(app.candidate?.resume),
        allowResumeDownload: allowDownload
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).populate('currentPlan');

    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .sort({ createDate: -1 })
      .limit(8)
      .populate('currentPlan')
      .lean();

    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName || req.user.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };
    const allJobs = await Job.find({ ...ownershipFilter, isDeleted: { $ne: true } }).lean();
    const defaultPlan = !employer?.currentPlan && req.user.selectedPlan
      ? await Plan.findById(req.user.selectedPlan).lean()
      : null;
    const expiredJobs = allJobs.filter(job => getJobDisplayStatus(job) === 'Expired');

    const plan = employer?.currentPlan || defaultPlan || jobs.find(job => job.currentPlan)?.currentPlan || null;
    const planLimit = Number(plan?.freeJobPosts || 0);
    const planUsage = await getEmployerPlanUsage({
      userId,
      employerId: employer?._id,
      plan,
      allJobs
    });
    const { jobsUsed, remainingCredits, utilization } = planUsage;

    const unlockLimitRaw = plan?.unlockCount || '0';
    const isUnlimitedUnlocks = String(unlockLimitRaw).toLowerCase() === 'unlimited';
    const unlockLimit = isUnlimitedUnlocks ? Number.MAX_SAFE_INTEGER : Number(unlockLimitRaw) || 0;

    const unlocksUsed = employer
      ? await EmployerResumeUnlock.countDocuments({
          employer: employer._id,
          plan: plan?._id || null,
          isDeleted: { $ne: true }
        })
      : 0;

    const remainingUnlocks = isUnlimitedUnlocks
      ? 'Unlimited'
      : Math.max(0, unlockLimit - unlocksUsed);
    // Ensure applications are seeded
    await ensureApplicationsExist(userId);

    const jobIds = allJobs.map(j => j._id);

    const [
      applicationCount,
      appliedCount,
      shortlistedCount,
      selectedCount,
      offeredCount,
      interviewCount,
      reviewCount,
      rejectedCount,
      onHoldCount
    ] = await Promise.all([
      Application.countDocuments({ job: { $in: jobIds } }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Applied' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Shortlisted' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Offered', 'selectionDetails.offerStatus': 'Selected' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Offered', 'selectionDetails.offerStatus': { $ne: 'Selected' } }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Interview', 'interviewDetails.onHold': { $ne: true } }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Reviewed' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Rejected' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Interview', 'interviewDetails.onHold': true })
    ]);

    // Group application counts by job and status
    const appCounts = await Application.aggregate([
      { $match: { job: { $in: allJobs.map(j => j._id) } } },
      { $group: { _id: { job: "$job", status: "$status", offerStatus: "$selectionDetails.offerStatus", onHold: "$interviewDetails.onHold" }, count: { $sum: 1 } } }
    ]);

    const countMap = {};
    appCounts.forEach(item => {
      const jobId = String(item._id.job);
      const status = item._id.status;
      const offerStatus = item._id.offerStatus;
      const onHold = item._id.onHold === true;
      if (!countMap[jobId]) {
        countMap[jobId] = { total: 0, applied: 0, reviewed: 0, shortlisted: 0, interview: 0, onHold: 0, selected: 0, offered: 0, rejected: 0 };
      }
      countMap[jobId].total += item.count;
      if (status === 'Applied') countMap[jobId].applied += item.count;
      if (status === 'Reviewed') countMap[jobId].reviewed += item.count;
      if (status === 'Shortlisted') countMap[jobId].shortlisted += item.count;
      if (status === 'Interview') {
        if (onHold) {
          countMap[jobId].onHold += item.count;
        } else {
          countMap[jobId].interview += item.count;
        }
      }
      if (status === 'Offered') {
        if (offerStatus === 'Selected') {
          countMap[jobId].selected += item.count;
        } else {
          countMap[jobId].offered += item.count;
        }
      }
      if (status === 'Rejected') countMap[jobId].rejected += item.count;
    });

    const latestApps = await Application.find({ job: { $in: jobIds } })
      .populate('candidate', 'name userId')
      .populate({ path: 'candidate', populate: { path: 'userId', select: 'email' } })
      .populate('job', 'jobTitle')
      .sort({ appliedDate: -1 })
      .limit(5)
      .lean();

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const interviewApps = await Application.find({
      job: { $in: jobIds },
      status: 'Interview',
      'interviewDetails.date': { $gte: todayStart }
    })
      .populate('candidate', 'name')
      .populate('job', 'jobTitle')
      .sort({ "interviewDetails.date": 1 })
      .limit(4)
      .lean();

    const jobStats = {
      total: allJobs.length,
      active: allJobs.filter(job => getJobDisplayStatus(job) === 'Active').length,
      draft: allJobs.filter(job => getJobDisplayStatus(job) === 'Draft').length,
      expired: expiredJobs.length,
      closed: allJobs.filter(job => ['Closed', 'Paused'].includes(getJobDisplayStatus(job))).length
    };
    const activeJobRows = allJobs
      .filter(job => ['Active', 'Expired'].includes(getJobDisplayStatus(job)))
      .map(job => {
        const jCounts = countMap[String(job._id)] || { total: 0, applied: 0, reviewed: 0, shortlisted: 0, interview: 0, onHold: 0, selected: 0, offered: 0, rejected: 0 };
        return {
          id: job._id,
          title: job.jobTitle,
          location: (job.jobLocations && job.jobLocations.length ? job.jobLocations : [job.city, job.state]).filter(Boolean).join(', '),
          workMode: job.workMode,
          status: getJobDisplayStatus(job),
          applications: jCounts.total,
          applied: jCounts.applied,
          reviewed: jCounts.reviewed,
          shortlisted: jCounts.shortlisted,
          interviews: jCounts.interview,
          onHold: jCounts.onHold,
          selected: jCounts.selected,
          offered: jCounts.offered,
          rejected: jCounts.rejected,
          postedAt: formatDate(job.createDate || job.postingDate)
        };
      });

    res.json({
      company: {
        name: employer?.companyName || req.user.companyName || req.user.firstName || 'Employer',
        verified: employer?.isVerified === true,
        status: employer?.status || req.user.status || 'active',
        planName: plan?.planName || 'No Plan',
        planBadge: plan?.badge || plan?.planName || 'No Plan',
        logo: employer?.logo || ''
      },
      subscription: {
        planName: plan?.planName || 'No Plan',
        status: employer?.status === 'blacklist' ? 'Inactive' : 'Active',
        validUntil: formatDate(employer?.planValidity || plan?.endDate || null),
        jobsUsed,
        jobLimit: planLimit,
        remainingCredits,
        utilization,
        unlockLimit: isUnlimitedUnlocks ? 'Unlimited' : unlockLimit,
        unlocksUsed,
        remainingUnlocks
      },
      actionCenter: {
        activeJobs: jobStats.active,
        newApplications: appliedCount,
        interviews: interviewCount,
        candidates: shortlistedCount,
        jobsExpiring: expiredJobs.length
      },
      stats: {
        jobs: jobStats,
        applications: applicationCount,
        reviewed: reviewCount,
        shortlisted: shortlistedCount,
        interviews: interviewCount,
        onHold: onHoldCount,
        selected: selectedCount,
        offered: offeredCount,
        rejected: rejectedCount,
        expired: expiredJobs.length
      },
      pipeline: {
        active: jobStats.active,
        applied: appliedCount,
        reviewed: reviewCount,
        shortlisted: shortlistedCount,
        interview: interviewCount,
        onHold: onHoldCount,
        selected: selectedCount,
        offered: offeredCount,
        rejected: rejectedCount,
        expired: expiredJobs.length
      },
      activeJobs: activeJobRows,
      jobPerformance: activeJobRows.slice(0, 7).map((job, index) => ({
        label: `J${index + 1}`,
        title: job.title,
        value: job.applications,
        active: index === 0
      })),
      latestApplications: latestApps.map(app => ({
        id: app._id,
        candidateName: app.candidate?.name || 'N/A',
        email: app.candidate?.userId?.email || '',
        position: app.job?.jobTitle || 'Open Position',
        appliedAt: formatDate(app.appliedDate || app.createDate),
        status: app.status
      })),
      upcomingInterviews: interviewApps.map(app => ({
        id: app._id,
        candidateName: app.candidate?.name || 'N/A',
        position: app.job?.jobTitle || 'Open Position',
        scheduledAt: app.interviewDetails?.date ? formatDate(app.interviewDetails.date) : formatDate(new Date()),
        scheduledTime: app.interviewDetails?.time || ''
      })),
      recentActivity: [
        { type: 'application', title: 'New Application Received', description: `${latestApps[0]?.candidate?.name || 'Candidate'} applied for ${latestApps[0]?.job?.jobTitle || 'a job'}`, time: '2 minutes ago' },
        { type: 'shortlisted', title: 'Candidate Shortlisted', description: `${latestApps[1]?.candidate?.name || 'Candidate'} shortlisted for ${latestApps[1]?.job?.jobTitle || 'a role'}`, time: '1 hour ago' },
        { type: 'interview', title: 'Interview Scheduled', description: `Interview scheduled for ${interviewApps[0]?.candidate?.name || 'candidate'}`, time: '3 hours ago' },
        { type: 'job', title: 'Job Published', description: `${jobs[0]?.jobTitle || 'Job'} has been published`, time: '5 hours ago' }
      ]
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).populate('currentPlan').populate('industryType').lean();

    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName || req.user.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };
    const allJobs = await Job.find({ ...ownershipFilter, isDeleted: { $ne: true } }).lean();
    const jobIds = allJobs.map(j => j._id);

    const activeJobsCount = allJobs.filter(job => getJobDisplayStatus(job) === 'Active').length;
    const hiredCount = await Application.countDocuments({ job: { $in: jobIds }, status: 'Offered' });
    const applicationsCount = await Application.countDocuments({ job: { $in: jobIds } });
    const teamMembersCount = employer?.teamMembers?.length || 1;

    const plan = employer?.currentPlan || null;
    const defaultPlan = !plan && req.user.selectedPlan
      ? await Plan.findById(req.user.selectedPlan).lean()
      : null;
    const effectivePlan = plan || defaultPlan;
    const planLimit = Number(effectivePlan?.freeJobPosts || 0);
    const planUsage = await getEmployerPlanUsage({
      userId,
      employerId: employer?._id,
      plan: effectivePlan,
      allJobs
    });
    const { jobsUsed, totalJobs, remainingCredits, utilization } = planUsage;
    const unlockLimitRaw = effectivePlan?.unlockCount || '0';
    const isUnlimitedUnlocks = String(unlockLimitRaw).toLowerCase() === 'unlimited';
    const unlockLimit = isUnlimitedUnlocks ? Number.MAX_SAFE_INTEGER : Number(unlockLimitRaw) || 0;
    const unlocksUsed = employer
      ? await EmployerResumeUnlock.countDocuments({
          employer: employer._id,
          plan: effectivePlan?._id || null,
          isDeleted: { $ne: true }
        })
      : 0;
    const remainingUnlocks = isUnlimitedUnlocks
      ? 'Unlimited'
      : Math.max(0, unlockLimit - unlocksUsed);

    let daysRemaining = 0;
    if (employer?.planValidity) {
      const diffMs = new Date(employer.planValidity).getTime() - Date.now();
      daysRemaining = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
    } else if (effectivePlan?.endDate) {
      const diffMs = new Date(effectivePlan.endDate).getTime() - Date.now();
      daysRemaining = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
    }

    const [industries, states, districts, cities, countries] = await Promise.all([
      IndustryType.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ sortingNo: 1, industryType: 1 }).lean(),
      State.find({ isDeleted: { $ne: true }, status: 'active' }).lean(),
      District.find({ isDeleted: { $ne: true }, status: 'active' }).lean(),
      City.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ cityName: 1 }).lean(),
      Country.find({ isDeleted: { $ne: true }, status: 'active' }).lean()
    ]);

    const profileCompletion = getEmployerProfileCompletion(employer, req.user);

    res.json({
      name: employer?.companyName || req.user.companyName || req.user.firstName || 'Employer',
      status: employer?.status || req.user.status || 'active',
      isVerified: employer?.isVerified === true,
      ...profileCompletion,
      planName: effectivePlan?.planName || 'No Plan',
      planBadge: effectivePlan?.badge || effectivePlan?.planName || 'No Plan',
      planValidity: employer?.planValidity || null,
      logo: employer?.logo || '',

      // Extended Profile Fields
      companyName: employer?.companyName || req.user.companyName || '',
      contactPerson: employer?.contactPerson || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
      phone: employer?.phone || req.user.phone || '',
      email: req.user.email,
      industryType: employer?.industryType || null,
      website: employer?.website || '',
      description: employer?.description || '',
      country: employer?.country || '',
      state: employer?.state || '',
      district: employer?.district || '',
      city: employer?.city || '',
      address: employer?.address || '',
      pinCode: employer?.pinCode || '',
      tagline: employer?.tagline || '',
      foundedYear: employer?.foundedYear || '',
      companySize: employer?.companySize || req.user.companySize || '',
      gstNumber: employer?.gstNumber || '',
      profileViews: employer?.profileViews !== undefined ? employer.profileViews : 5230,
      rating: employer?.rating !== undefined ? employer.rating : 4.2,
      socialLinks: employer?.socialLinks || {
        linkedin: '',
        twitter: '',
        youtube: '',
        facebook: '',
        instagram: ''
      },
      teamMembers: employer?.teamMembers && employer.teamMembers.length > 0 ? employer.teamMembers : [
        { name: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(), role: req.user.designation || 'HR Manager', accessLevel: 'Owner' }
      ],

      // Stats
      stats: {
        activeJobs: activeJobsCount,
        hired: hiredCount,
        profileViews: employer?.profileViews !== undefined ? employer.profileViews : 5230,
        rating: employer?.rating !== undefined ? employer.rating : 4.2
      },

      // Subscription
      subscription: {
        planName: effectivePlan?.planName || 'No Plan',
        status: employer?.status === 'blacklist' ? 'Inactive' : 'Active',
        validUntil: employer?.planValidity || effectivePlan?.endDate || null,
        jobsUsed,
        totalJobs,
        jobLimit: planLimit,
        remainingCredits,
        utilization,
        applicationsCount,
        applicationsLimit: 500,
        teamMembersCount,
        teamMembersLimit: 10,
        daysRemaining,
        unlockLimit: isUnlimitedUnlocks ? 'Unlimited' : unlockLimit,
        unlocksUsed,
        remainingUnlocks
      },

      // Masters
      industries,
      states,
      districts,
      cities,
      countries
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateEmployerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      companyName,
      contactPerson,
      phone,
      industryType,
      website,
      description,
      country,
      state,
      district,
      city,
      address,
      pinCode,
      tagline,
      foundedYear,
      companySize,
      gstNumber,
      socialLinks,
      teamMembers,
      logo
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    let employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    });

    if (!employer) {
      employer = new Employer({
        userId,
        login: userId,
        companyName: companyName || user.companyName || 'My Company',
        phone: phone || user.phone || '0000000000',
        country: country || '',
        state: state || '',
        district: district || '',
        city: city || '',
        address: address || '',
        pinCode: pinCode || '',
        status: 'active'
      });
    }

    if (companyName) {
      employer.companyName = companyName;
      await User.findByIdAndUpdate(userId, { companyName });
    }
    if (contactPerson !== undefined) employer.contactPerson = contactPerson;
    if (phone) {
      employer.phone = phone;
      await User.findByIdAndUpdate(userId, { phone });
    }
    if (industryType !== undefined) employer.industryType = industryType || null;
    if (website !== undefined) employer.website = website;
    if (description !== undefined) employer.description = description;
    if (country !== undefined) employer.country = country;
    if (state !== undefined) employer.state = state;
    if (district !== undefined) employer.district = district;
    if (city !== undefined) employer.city = city;
    if (address !== undefined) employer.address = address;
    if (pinCode !== undefined) employer.pinCode = pinCode;
    if (logo !== undefined) employer.logo = logo;
    if (tagline !== undefined) employer.tagline = tagline;
    if (foundedYear !== undefined) employer.foundedYear = foundedYear;
    if (companySize !== undefined) {
      employer.companySize = companySize;
      await User.findByIdAndUpdate(userId, { companySize });
    }
    if (gstNumber !== undefined) employer.gstNumber = gstNumber;
    if (socialLinks !== undefined) employer.socialLinks = socialLinks;
    if (teamMembers !== undefined) employer.teamMembers = teamMembers;

    await employer.save();

    res.json({ message: 'Profile updated successfully', employer });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.uploadEmployerLogo = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Logo image is required.' });
    }

    const userId = req.user._id;
    const fs = require('fs');
    const Attachment = require('../models/Attachment');
    const fileData = fs.readFileSync(req.file.path);
    await Attachment.findOneAndUpdate(
      { filename: req.file.filename },
      {
        filename: req.file.filename,
        data: fileData,
        mimeType: req.file.mimetype,
        size: req.file.size
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    fs.unlink(req.file.path, () => {});

    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || 'https';
    const publicOrigin = process.env.PUBLIC_BASE_URL || `${protocol}://${req.get('host')}`;
    const logoUrl = `${publicOrigin.replace(/\/+$/, '')}/uploads/employer-logos/${req.file.filename}`;

    const user = await User.findById(userId);
    let employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    });

    if (!employer) {
      employer = new Employer({
        userId,
        login: userId,
        companyName: user?.companyName || 'My Company',
        phone: user?.phone || '0000000000',
        status: 'active'
      });
    }

    employer.logo = logoUrl;
    await employer.save();

    res.json({ message: 'Logo uploaded successfully', logo: logoUrl });
  } catch (error) {
    console.error('Upload Employer Logo Error:', error);
    res.status(500).json({ message: 'Server error uploading logo' });
  }
};

exports.uploadEmployerBanner = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Company banner image is required.' });
    }

    const userId = req.user._id;
    const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
    const protocol = forwardedProto || req.protocol || 'https';
    const publicOrigin = process.env.PUBLIC_BASE_URL || `${protocol}://${req.get('host')}`;
    const bannerUrl = `${publicOrigin.replace(/\/+$/, '')}/uploads/employer-banners/${req.file.filename}`;

    const user = await User.findById(userId);
    let employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    });

    if (!employer) {
      employer = new Employer({
        userId,
        login: userId,
        companyName: user?.companyName || 'My Company',
        phone: user?.phone || '0000000000',
        status: 'active'
      });
    }

    employer.bannerImage = bannerUrl;
    await employer.save();

    res.json({ message: 'Company banner uploaded successfully', bannerImage: bannerUrl });
  } catch (error) {
    console.error('Upload Employer Banner Error:', error);
    res.status(500).json({ message: 'Server error uploading company banner' });
  }
};

exports.getEmployerSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    await seedEmployerPlansIfEmpty();

    const employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    }).populate('currentPlan').lean();

    const loginIds = [userId, employer?.userId, employer?.login].filter(Boolean);
    const companyName = employer?.companyName || req.user.companyName;
    const ownershipFilter = {
      $or: [
        { login: { $in: loginIds } },
        ...(companyName ? [{ companyName }] : [])
      ]
    };
    const allJobs = await Job.find({ ...ownershipFilter, isDeleted: { $ne: true } }).lean();
    const jobIds = allJobs.map(j => j._id);

    const activeJobsCount = allJobs.filter(job => getJobDisplayStatus(job) === 'Active').length;
    const applicationsCount = await Application.countDocuments({ job: { $in: jobIds } });
    const teamMembersCount = employer?.teamMembers?.length || 1;

    const plan = employer?.currentPlan || null;
    const defaultPlan = !plan && req.user.selectedPlan
      ? await Plan.findById(req.user.selectedPlan).lean()
      : null;
    const effectivePlan = plan || defaultPlan;
    const planLimit = Number(effectivePlan?.freeJobPosts || 0);

    let daysRemaining = 0;
    if (employer?.planValidity) {
      const diffMs = new Date(employer.planValidity).getTime() - Date.now();
      daysRemaining = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
    } else if (effectivePlan?.endDate) {
      const diffMs = new Date(effectivePlan.endDate).getTime() - Date.now();
      daysRemaining = Math.max(Math.ceil(diffMs / (1000 * 60 * 60 * 24)), 0);
    }

    // Retrieve active plans of category 'Employer'
    const availablePlans = await Plan.find({
      category: 'Employer',
      status: 'active',
      isDeleted: { $ne: true }
    }).sort({ displayOrder: 1, cost: 1 }).lean();

    // Query success payments history
    const billingHistory = await Payment.find({
      $or: [
        { customer: employer?._id },
        { login: userId }
      ],
      paymentStatus: 'Success',
      isDeleted: { $ne: true }
    }).sort({ paymentDate: -1 }).lean();

    const planUsage = await getEmployerPlanUsage({
      userId,
      employerId: employer?._id,
      plan: effectivePlan,
      allJobs,
      billingHistory
    });
    const { jobsUsed, totalJobs, remainingCredits, utilization } = planUsage;

    const unlockLimitRaw = effectivePlan?.unlockCount || '0';
    const isUnlimitedUnlocks = String(unlockLimitRaw).toLowerCase() === 'unlimited';
    const unlockLimit = isUnlimitedUnlocks ? Number.MAX_SAFE_INTEGER : Number(unlockLimitRaw) || 0;

    const unlocksUsed = employer
      ? await EmployerResumeUnlock.countDocuments({
          employer: employer._id,
          plan: effectivePlan?._id || null,
          isDeleted: { $ne: true }
        })
      : 0;

    const remainingUnlocks = isUnlimitedUnlocks
      ? 'Unlimited'
      : Math.max(0, unlockLimit - unlocksUsed);

    const autoMail = await getEmployerAutoMailSummary({ employer, plan: effectivePlan });

    res.json({
      subscription: {
        currentPlanId: effectivePlan?._id || null,
        planName: effectivePlan?.planName || 'Free Plan',
        status: employer?.status === 'blacklist' ? 'Inactive' : 'Active',
        validUntil: employer?.planValidity || effectivePlan?.endDate || null,
        jobsUsed,
        totalJobs,
        jobLimit: planLimit,
        remainingCredits,
        utilization,
        applicationsCount,
        applicationsLimit: 500, // standard display limit
        teamMembersCount,
        teamMembersLimit: 10,
        daysRemaining,
        autoMail,
        unlockLimit: isUnlimitedUnlocks ? 'Unlimited' : unlockLimit,
        unlocksUsed,
        remainingUnlocks
      },
      stats: {
        activeJobs: activeJobsCount,
        totalJobs,
        applications: applicationsCount,
        teamMembers: teamMembersCount,
        daysRemaining
      },
      availablePlans,
      billingHistory
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.selectEmployerPlan = async (req, res) => {
  try {
    const userId = req.user._id;
    const { planId } = req.body;

    if (!planId) {
      return res.status(400).json({ message: 'Plan is required.' });
    }

    const [employer, plan] = await Promise.all([
      Employer.findOne({
        $or: [{ userId }, { login: userId }],
        isDeleted: { $ne: true }
      }).populate('userId', 'email').lean(),
      Plan.findOne({
        _id: planId,
        category: 'Employer',
        status: 'active',
        isDeleted: { $ne: true }
      }).lean()
    ]);

    if (!employer) {
      return res.status(404).json({ message: 'Employer profile was not found.' });
    }

    if (!plan) {
      return res.status(404).json({ message: 'Selected employer plan was not found or is inactive.' });
    }

    const validFrom = new Date();
    const validTill = getPlanEndDate(plan, validFrom);
    const amount = Number(plan.cost) || 0;

    await Employer.findByIdAndUpdate(
      employer._id,
      addAuditOnUpdate(req, {
        currentPlan: plan._id,
        planValidity: validTill
      })
    );

    await Payment.create(addAuditOnCreate(req, {
      paymentId: await getNextPaymentId(),
      invoiceNo: await getNextInvoiceNo(),
      paymentDate: validFrom,
      userType: 'Employer',
      customer: employer._id,
      customerModel: 'Employer',
      customerName: employer.companyName || req.user.companyName || req.user.email,
      email: employer.userId?.email || req.user.email,
      phone: employer.phone || req.user.phone || '',
      plan: plan._id,
      planName: plan.planName,
      planAmount: amount,
      discount: 0,
      paidAmount: amount,
      paymentMethod: 'UPI',
      paymentGateway: 'Razorpay',
      gatewayTxnId: `EMP-${Date.now()}`,
      paymentStatus: 'Success',
      validityType: plan.planValidity,
      validFrom,
      validTill,
      remarks: 'Employer selected plan from subscription page.',
      recordedBy: 'Employer Portal'
    }));
    await ensureEmployerAutoMailSetting({ employer: { ...employer, currentPlan: plan._id }, plan, resetUsage: true });

    res.json({ message: `${plan.planName} activated successfully.` });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerJobForm = async (req, res) => {
  try {
    const userId = req.user._id;
    const [employer, categories, jobTypes, qualifications, cities, states, districts, countries] = await Promise.all([
      Employer.findOne({ $or: [{ userId }, { login: userId }], isDeleted: { $ne: true } }).populate('currentPlan'),
      JobCategory.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ sortingNo: 1, categoryName: 1 }).lean(),
      JobType.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ sortingNo: 1, jobType: 1 }).lean(),
      Qualification.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ sortingNo: 1, name: 1 }).lean(),
      City.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ cityName: 1, ctid: 1 }).lean(),
      State.find({ isDeleted: { $ne: true }, status: 'active' }).lean(),
      District.find({ isDeleted: { $ne: true }, status: 'active' }).lean(),
      Country.find({ isDeleted: { $ne: true }, status: 'active' }).lean()
    ]);
    const stateBySid = new Map(states.map(item => [item.sid, item]));
    const districtByDid = new Map(districts.map(item => [item.did, item]));
    const countryByCid = new Map(countries.map(item => [item.cid, item]));

    res.json({
      employer: employer ? {
        companyName: employer.companyName,
        contactPerson: employer.contactPerson,
        phone: employer.phone,
        email: req.user.email,
        country: employer.country,
        state: employer.state,
        district: employer.district,
        city: employer.city,
        currentPlan: employer.currentPlan?._id || employer.currentPlan || req.user.selectedPlan || null,
        planValidity: formatDate(employer.planValidity)
      } : {
        companyName: req.user.companyName || '',
        contactPerson: `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
        phone: req.user.phone || '',
        email: req.user.email,
        country: '',
        state: '',
        district: '',
        city: '',
        currentPlan: req.user.selectedPlan || null,
        planValidity: null
      },
      countries: countries.map(item => ({ id: item._id, cid: item.cid, name: item.countryName })),
      states: states.map(item => ({ id: item._id, cid: item.cid, sid: item.sid, name: item.stateName })),
      districts: districts.map(item => ({ id: item._id, sid: item.sid, did: item.did, name: item.districtName })),
      categories: categories.map(item => ({ id: item._id, name: item.categoryName })),
      jobTypes: jobTypes.map(item => ({ id: item._id, name: item.jobType })),
      qualifications: qualifications.map(item => ({ id: item._id, name: item.name })),
      locations: cities.map(item => ({
        id: item._id,
        cid: item.cid,
        sid: item.sid,
        did: item.did,
        name: item.cityName,
        country: countryByCid.get(item.cid)?.countryName || '',
        state: stateBySid.get(item.sid)?.stateName || '',
        district: districtByDid.get(item.did)?.districtName || ''
      }))
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerAutoMailSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({ $or: [{ userId }, { login: userId }], isDeleted: { $ne: true } }).populate('currentPlan').lean();
    if (!employer) return res.status(404).json({ message: 'Employer profile was not found.' });
    const summary = await getEmployerAutoMailSummary({ employer, plan: employer.currentPlan });
    const categories = await JobCategory.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ sortingNo: 1, categoryName: 1 }).lean();
    const locations = await City.find({ isDeleted: { $ne: true }, status: 'active' }).sort({ cityName: 1 }).limit(500).lean();
    res.json({
      settings: summary,
      plan: employer.currentPlan ? {
        id: employer.currentPlan._id,
        name: employer.currentPlan.planName,
        autoMailLimit: employer.currentPlan.autoMailLimit || 0
      } : null,
      filters: {
        categories: categories.map(item => ({ id: item._id, name: item.categoryName })),
        locations: locations.map(item => item.cityName).filter(Boolean)
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateEmployerAutoMailSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({ $or: [{ userId }, { login: userId }], isDeleted: { $ne: true } }).populate('currentPlan').lean();
    if (!employer) return res.status(404).json({ message: 'Employer profile was not found.' });
    const settings = await updateEmployerAutoMailSetting({ employer, plan: employer.currentPlan, payload: req.body || {} });
    res.json({ message: 'Auto mail settings saved successfully.', settings });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.previewEmployerJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({ $or: [{ userId }, { login: userId }], isDeleted: { $ne: true } }).lean();
    const preview = await buildJobPreview(req, employer, req.body || {});
    res.json(preview);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployerJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({ $or: [{ userId }, { login: userId }], isDeleted: { $ne: true } });
    const existingJob = await Job.findOne({ _id: req.params.id, login: userId, isDeleted: { $ne: true } });

    if (!existingJob) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    const {
      jobTitle,
      jobCategory,
      jobType,
      vacancies,
      workMode,
      jobLocations,
      description,
      jobSummary,
      detailedDescription,
      responsibilities,
      qualification,
      experience,
      requiredExperience,
      salary,
      minSalary,
      maxSalary,
      salaryUnit,
      salaryNegotiable,
      noticePeriod,
      joiningDate,
      shiftTiming,
      jobExpiry,
      benefits,
      aboutCompany,
      skills,
      languages,
      candidateLocationPreference,
      screeningQuestions,
      publishStatus,
      country,
      state,
      district,
      city,
      companyName,
      contactPerson,
      email,
      phone,
      currentPlan,
      planValidity,
      status
    } = req.body;

    if (!jobTitle || !jobCategory || !jobType || !vacancies || !(description || detailedDescription || jobSummary) || !(experience || requiredExperience)) {
      return res.status(400).json({ message: 'Please fill all required job details.' });
    }

    const finalPublishStatus = publishStatus || status || existingJob.publishStatus || 'publish';
    const finalDescription = description || detailedDescription || jobSummary || '';
    const selectedLocations = splitList(jobLocations);
    const primaryCity = selectedLocations[0] || city || employer?.city || existingJob.city || '';
    const matchedCity = primaryCity ? await City.findOne({
      cityName: { $regex: `^${primaryCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      isDeleted: { $ne: true }
    }).lean() : null;
    const [matchedState, matchedDistrict, matchedCountry] = await Promise.all([
      matchedCity?.sid ? State.findOne({ sid: matchedCity.sid, isDeleted: { $ne: true } }).lean() : null,
      matchedCity?.did ? District.findOne({ did: matchedCity.did, isDeleted: { $ne: true } }).lean() : null,
      matchedCity?.cid ? Country.findOne({ cid: matchedCity.cid, isDeleted: { $ne: true } }).lean() : null
    ]);

    const updatedJob = await Job.findByIdAndUpdate(
      existingJob._id,
      {
        jobTitle,
        jobCategory,
        jobType,
        vacancies: Number(vacancies) || 1,
        workMode: workMode || 'Office',
        jobLocations: selectedLocations,
        description: finalDescription,
        jobSummary: jobSummary || '',
        detailedDescription: detailedDescription || description || '',
        responsibilities: responsibilities || '',
        qualification: qualification || null,
        experience: experience || requiredExperience,
        requiredExperience: requiredExperience || experience || '',
        salary: salary || '',
        minSalary: nullableNumber(minSalary),
        maxSalary: nullableNumber(maxSalary),
        salaryUnit: salaryUnit || '',
        salaryNegotiable: salaryNegotiable !== false,
        noticePeriod: noticePeriod || '',
        joiningDate: joiningDate || null,
        shiftTiming: shiftTiming || '',
        jobExpiry: jobExpiry || null,
        benefits: benefits || '',
        aboutCompany: aboutCompany || '',
        skills: splitList(skills),
        languages: splitList(languages),
        candidateLocationPreference: candidateLocationPreference || '',
        screeningQuestions: screeningQuestions || '',
        publishStatus: finalPublishStatus,
        country: country || matchedCountry?.countryName || employer?.country || existingJob.country || 'India',
        state: state || matchedState?.stateName || employer?.state || existingJob.state || 'N/A',
        district: district || matchedDistrict?.districtName || employer?.district || existingJob.district || 'N/A',
        city: primaryCity || 'N/A',
        companyName: companyName || employer?.companyName || req.user.companyName || existingJob.companyName || 'Employer',
        contactPerson: contactPerson || employer?.contactPerson || existingJob.contactPerson || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
        email: email || req.user.email || existingJob.email,
        phone: phone || employer?.phone || req.user.phone || existingJob.phone || 'N/A',
        currentPlan: currentPlan || employer?.currentPlan || existingJob.currentPlan || null,
        planValidity: planValidity || jobExpiry || employer?.planValidity || existingJob.planValidity || null,
        status: finalPublishStatus === 'draft' ? 'pending' : 'active',
        updatedLogin: userId
      },
      { new: true }
    );

    res.json({ message: 'Job updated successfully.', job: updatedJob });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.duplicateEmployerJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const sourceJob = await Job.findOne({ _id: req.params.id, login: userId, isDeleted: { $ne: true } }).lean();

    if (!sourceJob) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    const {
      _id,
      __v,
      createDate,
      updateDate,
      ...jobData
    } = sourceJob;

    const copiedJob = await Job.create({
      ...jobData,
      jobTitle: `${sourceJob.jobTitle} Copy`,
      postingDate: new Date(),
      publishStatus: 'draft',
      status: 'pending',
      login: userId,
      updatedLogin: userId,
      ip: req.clientIp || sourceJob.ip || '127.0.0.1'
    });

    res.status(201).json({ message: 'Job duplicated successfully.', job: copiedJob });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployerJobAction = async (req, res) => {
  try {
    const userId = req.user._id;
    const { action } = req.body;
    const job = await Job.findOne({ _id: req.params.id, login: userId, isDeleted: { $ne: true } });

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    if (!['pause', 'close', 'reopen', 'renew', 'publish'].includes(action)) {
      return res.status(400).json({ message: 'Invalid job action.' });
    }

    if (action === 'pause') {
      job.status = 'inactive';
    }

    if (action === 'close') {
      job.status = 'closed';
    }

    if (action === 'reopen' || action === 'publish') {
      job.status = 'active';
      job.publishStatus = 'publish';
    }

    if (action === 'renew') {
      const baseDate = job.jobExpiry && new Date(job.jobExpiry) > new Date() ? job.jobExpiry : new Date();
      job.status = 'active';
      job.publishStatus = 'publish';
      job.jobExpiry = addDays(baseDate, 30);
      job.planValidity = job.planValidity || job.jobExpiry;
    }

    job.updatedLogin = userId;
    await job.save();

    res.json({ message: 'Job action updated successfully.', job });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteEmployerJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const job = await Job.findOneAndUpdate(
      { _id: req.params.id, login: userId, isDeleted: { $ne: true } },
      { isDeleted: true, updatedLogin: userId },
      { new: true }
    );

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

    res.json({ message: 'Job deleted successfully.' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.createEmployerJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const employer = await Employer.findOne({ $or: [{ userId }, { login: userId }], isDeleted: { $ne: true } });
    const planId = employer?.currentPlan || req.user.selectedPlan || null;
    const activePlan = planId ? await Plan.findOne({
      _id: planId,
      isDeleted: { $ne: true },
      status: { $ne: 'inactive' }
    }).lean() : null;
    if (activePlan) {
      const planLimit = Number(activePlan.freeJobPosts || 0);
      const { jobsUsed } = await getEmployerPlanUsage({
        userId,
        employerId: employer?._id,
        plan: activePlan
      });
      if (jobsUsed >= planLimit) {
        return res.status(403).json({
          message: `Your ${activePlan.planName} plan allows ${planLimit} job post${planLimit === 1 ? '' : 's'}. Please upgrade your plan to post more jobs.`
        });
      }
    }
    const {
      jobTitle,
      jobCategory,
      jobType,
      vacancies,
      workMode,
      jobLocations,
      description,
      jobSummary,
      detailedDescription,
      responsibilities,
      qualification,
      experience,
      requiredExperience,
      salary,
      minSalary,
      maxSalary,
      salaryUnit,
      salaryNegotiable,
      noticePeriod,
      joiningDate,
      shiftTiming,
      jobExpiry,
      benefits,
      aboutCompany,
      skills,
      languages,
      candidateLocationPreference,
      screeningQuestions,
      publishStatus,
      country,
      state,
      district,
      city,
      companyName,
      contactPerson,
      email,
      phone,
      currentPlan,
      planValidity,
      status
    } = req.body;

    if (!jobTitle || !jobCategory || !jobType || !vacancies || !(description || detailedDescription || jobSummary) || !(experience || requiredExperience)) {
      return res.status(400).json({ message: 'Please fill all required job details.' });
    }

    const finalPublishStatus = publishStatus || status || 'publish';
    const finalDescription = description || detailedDescription || jobSummary || '';
    const selectedLocations = splitList(jobLocations);
    const primaryCity = selectedLocations[0] || city || employer?.city || '';
    const matchedCity = primaryCity ? await City.findOne({
      cityName: { $regex: `^${primaryCity.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' },
      isDeleted: { $ne: true }
    }).lean() : null;
    const [matchedState, matchedDistrict, matchedCountry] = await Promise.all([
      matchedCity?.sid ? State.findOne({ sid: matchedCity.sid, isDeleted: { $ne: true } }).lean() : null,
      matchedCity?.did ? District.findOne({ did: matchedCity.did, isDeleted: { $ne: true } }).lean() : null,
      matchedCity?.cid ? Country.findOne({ cid: matchedCity.cid, isDeleted: { $ne: true } }).lean() : null
    ]);
    const job = await Job.create({
      jobTitle,
      jobCategory,
      jobType,
      vacancies: Number(vacancies) || 1,
      workMode: workMode || 'Onsite',
      jobLocations: selectedLocations,
      description: finalDescription,
      jobSummary: jobSummary || '',
      detailedDescription: detailedDescription || description || '',
      responsibilities: responsibilities || '',
      qualification: qualification || null,
      experience: experience || requiredExperience,
      requiredExperience: requiredExperience || experience || '',
      salary: salary || '',
      minSalary: nullableNumber(minSalary),
      maxSalary: nullableNumber(maxSalary),
      salaryUnit: salaryUnit || '',
      salaryNegotiable: salaryNegotiable !== false,
      noticePeriod: noticePeriod || '',
      joiningDate: joiningDate || null,
      shiftTiming: shiftTiming || '',
      jobExpiry: jobExpiry || null,
      benefits: benefits || '',
      aboutCompany: aboutCompany || '',
      skills: splitList(skills),
      languages: splitList(languages),
      candidateLocationPreference: candidateLocationPreference || '',
      screeningQuestions: screeningQuestions || '',
      publishStatus: finalPublishStatus,
      country: country || matchedCountry?.countryName || employer?.country || 'India',
      state: state || matchedState?.stateName || employer?.state || 'N/A',
      district: district || matchedDistrict?.districtName || employer?.district || 'N/A',
      city: primaryCity || 'N/A',
      companyName: companyName || employer?.companyName || req.user.companyName || 'Employer',
      contactPerson: contactPerson || employer?.contactPerson || `${req.user.firstName || ''} ${req.user.lastName || ''}`.trim(),
      email: email || req.user.email,
      phone: phone || employer?.phone || req.user.phone || 'N/A',
      currentPlan: currentPlan || employer?.currentPlan || req.user.selectedPlan || null,
      planValidity: planValidity || jobExpiry || employer?.planValidity || null,
      status: finalPublishStatus === 'draft' ? 'pending' : 'active',
      ip: req.clientIp || '127.0.0.1',
      login: userId
    });
    const autoMail = await sendEmployerJobAutoMails({
      employer,
      plan: activePlan,
      job: job.toObject()
    });

    res.status(201).json({ message: 'Job published successfully.', job, autoMail });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['Applied', 'Shortlisted', 'Interview', 'Reviewed', 'Rejected', 'Offered'].includes(status)) {
      return res.status(400).json({ message: 'Invalid application status.' });
    }

    const application = await Application.findById(id).populate('job', 'login minSalary maxSalary jobType');
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (String(application.job?.login) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not allowed to update this application.' });
    }

    const previousStatus = application.status;
    application.previousStatus = previousStatus;
    if (status === 'Rejected') {
      application.rejectedFromStatus = previousStatus && previousStatus !== 'Rejected'
        ? previousStatus
        : application.rejectedFromStatus || 'Not available';
      application.rejectedDate = new Date();
    }
    application.status = status;
    if (status === 'Shortlisted') {
      application.shortlistedDate = new Date();
    }
    if (status === 'Offered') {
      const isNewSelection = previousStatus !== 'Offered';
      const currentDetails = application.selectionDetails || {};
      application.selectionDetails = {
        ...currentDetails,
        selectedDate: isNewSelection ? new Date() : (currentDetails.selectedDate || new Date()),
        interviewScore: isNewSelection ? (application.matchScore ?? null) : (currentDetails.interviewScore ?? application.matchScore ?? null),
        offerStatus: isNewSelection ? 'Selected' : (currentDetails.offerStatus || 'Selected'),
        salaryOffered: isNewSelection ? (application.job?.maxSalary ?? application.job?.minSalary ?? null) : (currentDetails.salaryOffered ?? application.job?.maxSalary ?? application.job?.minSalary ?? null),
        offerSentAt: isNewSelection ? null : currentDetails.offerSentAt,
        joiningDate: isNewSelection ? null : currentDetails.joiningDate,
        employmentType: isNewSelection ? '' : (currentDetails.employmentType || ''),
        notes: isNewSelection ? '' : (currentDetails.notes || ''),
        offerRespondedAt: isNewSelection ? null : currentDetails.offerRespondedAt,
        hiredAt: isNewSelection ? null : currentDetails.hiredAt
      };
    }
    await application.save();

    // Send application status update email to jobseeker
    const { sendApplicationStatusEmail } = require('../utils/jobNotifications');
    (async () => {
      try {
        const fullApp = await Application.findById(application._id)
          .populate({
            path: 'candidate',
            populate: { path: 'userId', select: 'email' }
          })
          .populate('job', 'jobTitle companyName')
          .lean();
        const candidateUserId = fullApp?.candidate?.userId?._id || fullApp?.candidate?.userId;
        if (fullApp?.candidate?.userId?.email && candidateUserId) {
          await sendApplicationStatusEmail({
            to: fullApp.candidate.userId.email,
            seekerName: fullApp.candidate.name,
            jobTitle: fullApp.job?.jobTitle || 'Job Position',
            companyName: fullApp.job?.companyName || 'Employer',
            status: fullApp.status === 'Offered' ? (fullApp.selectionDetails?.offerStatus || 'Selected') : fullApp.status,
            recipientId: candidateUserId
          });
        }
      } catch (err) {
        console.error('Error sending application status update email:', err);
      }
    })();

    res.json({ message: `Candidate status updated to ${status} successfully.`, application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateSelectedOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      offerStatus,
      salaryOffered,
      joiningDate,
      employmentType,
      interviewScore,
      notes
    } = req.body;

    if (!['Selected', 'Offer Sent', 'Offer Accepted', 'Offer Declined', 'Hired'].includes(offerStatus)) {
      return res.status(400).json({ message: 'Invalid offer status.' });
    }

    const application = await Application.findById(id).populate('job', 'login minSalary maxSalary');
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (String(application.job?.login) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not allowed to update this selected candidate.' });
    }

    application.status = 'Offered';
    const currentDetails = application.selectionDetails || {};
    application.selectionDetails = {
      ...currentDetails,
      selectedDate: currentDetails.selectedDate || new Date(),
      interviewScore: interviewScore !== undefined ? Number(interviewScore) : (currentDetails.interviewScore ?? application.matchScore ?? null),
      offerStatus,
      salaryOffered: salaryOffered !== undefined && salaryOffered !== '' ? Number(salaryOffered) : (currentDetails.salaryOffered ?? application.job?.maxSalary ?? application.job?.minSalary ?? null),
      joiningDate: joiningDate ? new Date(joiningDate) : currentDetails.joiningDate,
      employmentType: employmentType ?? currentDetails.employmentType ?? '',
      notes: notes ?? currentDetails.notes ?? '',
      offerSentAt: offerStatus === 'Offer Sent' ? (currentDetails.offerSentAt || new Date()) : currentDetails.offerSentAt,
      offerRespondedAt: ['Offer Accepted', 'Offer Declined'].includes(offerStatus) ? new Date() : currentDetails.offerRespondedAt,
      hiredAt: offerStatus === 'Hired' ? new Date() : currentDetails.hiredAt
    };

    await application.save();

    // Send application status update email to jobseeker
    const { sendApplicationStatusEmail } = require('../utils/jobNotifications');
    (async () => {
      try {
        const fullApp = await Application.findById(application._id)
          .populate({
            path: 'candidate',
            populate: { path: 'userId', select: 'email' }
          })
          .populate('job', 'jobTitle companyName')
          .lean();
        const candidateUserId = fullApp?.candidate?.userId?._id || fullApp?.candidate?.userId;
        if (fullApp?.candidate?.userId?.email && candidateUserId) {
          await sendApplicationStatusEmail({
            to: fullApp.candidate.userId.email,
            seekerName: fullApp.candidate.name,
            jobTitle: fullApp.job?.jobTitle || 'Job Position',
            companyName: fullApp.job?.companyName || 'Employer',
            status: offerStatus,
            recipientId: candidateUserId
          });
        }
      } catch (err) {
        console.error('Error sending application status update email:', err);
      }
    })();

    res.json({ message: `Offer status updated to ${offerStatus}.`, application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.scheduleApplicationInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, type, status, interviewer, locationOrLink, notes, onHold } = req.body;

    const application = await Application.findById(id).populate('job', 'login contactPerson');
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (String(application.job?.login) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not allowed to schedule this application.' });
    }

    const normalizedType = type === 'Telephonic' ? 'Phone Call' : type;
    const isOnHold = Boolean(onHold);

    application.status = 'Interview';
    application.interviewDetails = {
      date: date ? new Date(date) : application.interviewDetails?.date,
      time: time || application.interviewDetails?.time || '',
      type: normalizedType,
      status: isOnHold ? 'On Hold' : (status || application.interviewDetails?.status || 'Scheduled'),
      onHold: isOnHold,
      interviewer: interviewer || application.interviewDetails?.interviewer || application.job?.contactPerson || req.user.firstName || req.user.companyName || '',
      locationOrLink: locationOrLink ?? application.interviewDetails?.locationOrLink ?? '',
      manualAddress: req.body.manualAddress ?? application.interviewDetails?.manualAddress ?? '',
      notes: notes ?? application.interviewDetails?.notes ?? ''
    };

    await application.save();

    if (isOnHold) {
      return res.json({ message: 'Application moved to interview on hold.', application });
    }

    // Send application status update email to jobseeker
    const { sendApplicationStatusEmail } = require('../utils/jobNotifications');
    (async () => {
      try {
        const fullApp = await Application.findById(application._id)
          .populate({
            path: 'candidate',
            populate: { path: 'userId', select: 'email' }
          })
          .populate('job', 'jobTitle companyName')
          .lean();
        const candidateUserId = fullApp?.candidate?.userId?._id || fullApp?.candidate?.userId;
        if (fullApp?.candidate?.userId?.email && candidateUserId) {
          await sendApplicationStatusEmail({
            to: fullApp.candidate.userId.email,
            seekerName: fullApp.candidate.name,
            jobTitle: fullApp.job?.jobTitle || 'Job Position',
            companyName: fullApp.job?.companyName || 'Employer',
            status: 'Interview Scheduled',
            recipientId: candidateUserId
          });
        }
      } catch (err) {
        console.error('Error sending application status update email:', err);
      }
    })();

    res.json({ message: 'Interview scheduled successfully.', application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================================================================
// TALENT POOL CONTROLLER FUNCTIONS
// =========================================================================

// Get Talent Pool for an Employer (with filtering, sorting, statistics, and seeding)
exports.getEmployerTalentPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const query = req.query || {};

    // 1. Fetch current employer's pool
    let poolItems = await TalentPool.find({ employerId: userId, isDeleted: { $ne: true } })
      .populate({
        path: 'candidateId',
        populate: [
          { path: 'userId', select: 'email' },
          { path: 'qualification', select: 'name' },
          { path: 'jobCategory', select: 'categoryName' },
          { path: 'jobType', select: 'jobType' },
          { path: 'currentPlan', select: 'planName' }
        ]
      })
      .lean();

    // 2. Auto-seed if pool is empty
    if (poolItems.length === 0) {
      const mockCandidates = [
        { name: 'Priya Sharma', email: 'priya@gmail.com', city: 'Bangalore', state: 'Karnataka', experience: '5+ Years', category: 'High Potential', skills: ['React', 'JS', 'TS'], phone: '9876543210', gender: 'Female' },
        { name: 'Arjun Mehta', email: 'arjun@gmail.com', city: 'Pune', state: 'Maharashtra', experience: '2+ Years', category: 'Technical Skills', skills: ['Python', 'Django', 'AWS'], phone: '9876543211', gender: 'Male' },
        { name: 'Neha Singh', email: 'neha@gmail.com', city: 'Mumbai', state: 'Maharashtra', experience: '5+ Years', category: 'Leadership Quality', skills: ['UI/UX', 'Figma', 'Sketch'], phone: '9876543212', gender: 'Female' },
        { name: 'Amit Verma', email: 'amit@gmail.com', city: 'Delhi', state: 'Delhi', experience: '2+ Years', category: 'Cultural Fit', skills: ['Java', 'Spring', 'MySQL'], phone: '9876543213', gender: 'Male' },
        { name: 'Sneha Gupta', email: 'sneha@gmail.com', city: 'Jaipur', state: 'Rajasthan', experience: '1+ Years', category: 'Future Reference', skills: ['SEO', 'Content', 'Analytics'], phone: '9876543214', gender: 'Female' },
        { name: 'Vikram Patel', email: 'vikram@gmail.com', city: 'Ahmedabad', state: 'Gujarat', experience: '5+ Years', category: 'High Potential', skills: ['React', 'Node', 'MongoDB'], phone: '9876543215', gender: 'Male' },
        { name: 'Karan Malhotra', email: 'karan@gmail.com', city: 'Chandigarh', state: 'Punjab', experience: 'Fresher', category: 'Leadership Quality', skills: ['Python', 'ML', 'SQL'], phone: '9876543216', gender: 'Male' }
      ];

      let qual = await Qualification.findOne();
      if (!qual) {
        qual = await Qualification.create({ name: 'Graduate' });
      }

      for (const mc of mockCandidates) {
        // Find or create User
        let user = await User.findOne({ email: mc.email });
        if (!user) {
          user = await User.create({
            email: mc.email,
            password: '$2b$10$hashedpasswordplaceholder',
            role: 'Jobseeker',
            accountType: 'jobseeker',
            firstName: mc.name.split(' ')[0],
            lastName: mc.name.split(' ').slice(1).join(' ') || ''
          });
        }

        // Find or create Jobseeker
        let seeker = await Jobseeker.findOne({ userId: user._id });
        if (!seeker) {
          seeker = await Jobseeker.create({
            userId: user._id,
            login: user._id,
            name: mc.name,
            phone: mc.phone,
            gender: mc.gender,
            qualification: qual._id,
            experience: mc.experience,
            country: 'India',
            state: mc.state,
            district: mc.city,
            city: mc.city,
            address: 'Not Specified',
            pinCode: '560001',
            status: 'active'
          });
        }

        // Add to TalentPool
        await TalentPool.create({
          employerId: userId,
          candidateId: seeker._id,
          category: mc.category,
          skills: mc.skills,
          note: `Mock seeded candidate: ${mc.name}`
        });
      }

      // Re-fetch seeded items
      poolItems = await TalentPool.find({ employerId: userId, isDeleted: { $ne: true } })
        .populate({
          path: 'candidateId',
          populate: [
            { path: 'userId', select: 'email' },
            { path: 'qualification', select: 'name' },
            { path: 'jobCategory', select: 'categoryName' },
            { path: 'jobType', select: 'jobType' },
            { path: 'currentPlan', select: 'planName' }
          ]
        })
        .lean();
    }

    // 3. Map candidates
    const mapMockSkills = (name = '') => {
      const n = String(name).toLowerCase();
      if (n.includes('priya')) return ['React', 'JS', 'TS'];
      if (n.includes('arjun')) return ['Python', 'Django', 'AWS'];
      if (n.includes('neha')) return ['UI/UX', 'Figma', 'Sketch'];
      if (n.includes('amit')) return ['Java', 'Spring', 'MySQL'];
      if (n.includes('sneha')) return ['SEO', 'Content', 'Analytics'];
      if (n.includes('vikram')) return ['React', 'Node', 'MongoDB'];
      if (n.includes('karan')) return ['Python', 'ML', 'SQL'];
      return ['HTML', 'CSS', 'JS'];
    };

    const showContacts = await getEmployerShowContactDetails(userId);
    const allowDownload = await getEmployerAllowResumeDownload(userId);
    let mapped = poolItems.map((item, idx) => {
      if (!item.candidateId) return null;
      const cMapped = mapCandidate(item.candidateId, idx, showContacts, allowDownload);
      return {
        ...cMapped,
        talentPoolId: item._id,
        category: item.category,
        skills: item.skills && item.skills.length > 0 ? item.skills : mapMockSkills(item.candidateId.name),
        note: item.note || '',
        dateAdded: item.createDate || item.createdAt
      };
    }).filter(Boolean);

    // 4. Apply filters
    const search = String(query.search || '').trim().toLowerCase();
    const category = String(query.category || '').trim();
    const experience = String(query.experience || '').trim();

    mapped = mapped.filter(item => {
      const searchableText = [
        item.name,
        item.email,
        item.phone,
        item.location,
        item.skills.join(' '),
        item.category,
        item.experience
      ].join(' ').toLowerCase();

      const matchesSearch = !search || searchableText.includes(search);
      const matchesCategory = !category || item.category === category;
      const matchesExperience = !experience || item.experience === experience;

      return matchesSearch && matchesCategory && matchesExperience;
    });

    // 5. Apply sorting
    const sortBy = String(query.sortBy || '').trim();
    if (sortBy === 'Oldest First') {
      mapped.sort((a, b) => new Date(a.dateAdded).getTime() - new Date(b.dateAdded).getTime());
    } else if (sortBy === 'Name A-Z') {
      mapped.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'Name Z-A') {
      mapped.sort((a, b) => b.name.localeCompare(a.name));
    } else {
      // Default: Newest First
      mapped.sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime());
    }

    // 6. Calculate Stats
    const totalCount = poolItems.length;
    const highPotentialCount = poolItems.filter(item => item.category === 'High Potential').length;
    const technicalCount = poolItems.filter(item => item.category === 'Technical Skills').length;
    const leadershipCount = poolItems.filter(item => item.category === 'Leadership Quality').length;
    
    // Candidates added in last 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const newThisMonthCount = poolItems.filter(item => {
      const added = item.createDate || item.createdAt;
      return added && new Date(added) >= thirtyDaysAgo;
    }).length;

    res.json({
      candidates: mapped,
      stats: {
        totalCount,
        highPotentialCount,
        technicalCount,
        leadershipCount,
        newThisMonthCount
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add candidate to pool
exports.addEmployerTalentPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { candidateId, category, skills, note } = req.body;

    if (!candidateId) {
      return res.status(400).json({ message: 'Candidate ID is required.' });
    }

    // Check if jobseeker exists
    const candidate = await Jobseeker.findById(candidateId);
    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found.' });
    }

    // Check if already in pool
    let poolItem = await TalentPool.findOne({ employerId: userId, candidateId, isDeleted: { $ne: true } });
    if (poolItem) {
      poolItem.category = category || poolItem.category;
      poolItem.skills = skills || poolItem.skills;
      poolItem.note = note || poolItem.note;
      await poolItem.save();
      return res.json({ message: 'Talent pool candidate updated.', poolItem });
    }

    poolItem = await TalentPool.create({
      employerId: userId,
      candidateId,
      category: category || 'High Potential',
      skills: skills || [],
      note: note || ''
    });

    res.json({ message: 'Candidate saved to talent pool.', poolItem });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove candidate from pool
exports.removeEmployerTalentPool = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params; // Can be TalentPool record ID or Candidate ID

    if (!id) {
      return res.status(400).json({ message: 'Record ID or candidate ID is required.' });
    }

    const poolItem = await TalentPool.findOne({
      employerId: userId,
      $or: [{ _id: id }, { candidateId: id }],
      isDeleted: { $ne: true }
    });

    if (!poolItem) {
      return res.status(404).json({ message: 'Candidate not found in talent pool.' });
    }

    poolItem.isDeleted = true;
    await poolItem.save();

    res.json({ message: 'Candidate removed from talent pool successfully.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Search all candidates in system *not* in current pool
exports.searchEmployerTalentPoolCandidates = async (req, res) => {
  try {
    const userId = req.user._id;
    const search = String(req.query.search || '').trim().toLowerCase();

    // Find candidate IDs already in the pool
    const poolItems = await TalentPool.find({ employerId: userId, isDeleted: { $ne: true } }).select('candidateId').lean();
    const excludedIds = poolItems.map(item => item.candidateId);

    // Query jobseekers
    const candidates = await Jobseeker.find({
      _id: { $nin: excludedIds },
      isDeleted: { $ne: true },
      status: { $ne: 'blacklist' }
    })
      .populate('userId', 'email')
      .populate('qualification', 'name')
      .populate('jobCategory', 'categoryName')
      .populate('jobType', 'jobType')
      .populate('currentPlan', 'planName')
      .lean();

    const showContacts = await getEmployerShowContactDetails(req.user._id);
    const allowDownload = await getEmployerAllowResumeDownload(req.user._id);
    let mapped = candidates.map((item, idx) => mapCandidate(item, idx, showContacts, allowDownload));

    if (search) {
      mapped = mapped.filter(item => {
        const text = [
          item.name,
          item.email,
          item.phone,
          item.location,
          item.role,
          item.experience
        ].join(' ').toLowerCase();
        return text.includes(search);
      });
    }

    res.json(mapped);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// =========================================================================
// RECRUITER SETTINGS FUNCTIONS
// =========================================================================

// Get Recruiter Settings
exports.getEmployerSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    let employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    });

    if (!employer) {
      // Create a basic employer profile if none exists
      employer = await Employer.create({
        userId,
        login: userId,
        companyName: req.user.companyName || 'TechCorp India',
        phone: req.user.phone || '9876543210',
        currentPlan: req.user.selectedPlan || null
      });
    }

    const fullName = [req.user.firstName, req.user.lastName].filter(Boolean).join(' ') || req.user.companyName || 'Recruiter';

    res.json({
      profile: {
        fullName,
        email: req.user.email,
        phone: employer.phone || req.user.phone || '',
        jobTitle: req.user.designation || '',
        department: employer.department || '',
        altEmail: employer.altEmail || '',
        bio: employer.bio || '',
        companyBanner: employer.bannerImage || ''
      },
      settings: employer.settings || {
        notifications: {
          newApplications: true,
          interviewReminders: true,
          candidateMessages: true,
          pipelineProgress: true,
          billingUpdates: true,
          weeklyDigest: false,
          appApplications: true,
          appReminders: true,
          appAnnouncements: true
        },
        preferences: {
          language: 'en',
          timezone: 'IST',
          dateFormat: 'DD/MM/YYYY',
          timeFormat: '12hr',
          currency: 'INR',
          itemsPerPage: '10'
        },
        privacy: {
          showPublic: true,
          showPhone: false,
          readReceipts: true,
          emailSearch: true
        }
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Recruiter Settings
exports.updateEmployerSettings = async (req, res) => {
  try {
    const userId = req.user._id;
    const { type, profile, password, notifications, preferences, privacy } = req.body;

    let employer = await Employer.findOne({
      $or: [{ userId }, { login: userId }],
      isDeleted: { $ne: true }
    });

    if (!employer) {
      employer = await Employer.create({
        userId,
        login: userId,
        companyName: req.user.companyName || 'TechCorp India',
        phone: req.user.phone || '9876543210',
        currentPlan: req.user.selectedPlan || null
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    if (type === 'profile') {
      const parts = String(profile.fullName || '').trim().split(/\s+/);
      user.firstName = parts[0] || '';
      user.lastName = parts.slice(1).join(' ') || '';
      user.designation = profile.jobTitle || '';
      await user.save();

      employer.phone = profile.phone || employer.phone;
      employer.department = profile.department || '';
      employer.altEmail = profile.altEmail || '';
      employer.bio = profile.bio || '';
      if (profile.companyBanner !== undefined) employer.bannerImage = profile.companyBanner || '';
      await employer.save();

      return res.json({ message: 'Profile settings saved successfully.' });
    }

    if (type === 'password') {
      const { current, newPass } = password;
      const isMatch = await user.comparePassword(current);
      if (!isMatch) {
        return res.status(400).json({ message: 'Current password is incorrect.' });
      }

      user.password = newPass;
      await user.save();

      return res.json({ message: 'Password updated successfully.' });
    }

    if (type === 'notifications') {
      employer.settings = {
        ...employer.settings,
        notifications: {
          ...employer.settings?.notifications,
          ...notifications
        }
      };
      await employer.save();
      return res.json({ message: 'Notification settings saved.' });
    }

    if (type === 'preferences') {
      employer.settings = {
        ...employer.settings,
        preferences: {
          ...employer.settings?.preferences,
          ...preferences
        }
      };
      await employer.save();
      return res.json({ message: 'App preferences saved.' });
    }

    if (type === 'privacy') {
      employer.settings = {
        ...employer.settings,
        privacy: {
          ...employer.settings?.privacy,
          ...privacy
        }
      };
      await employer.save();
      return res.json({ message: 'Privacy preferences saved.' });
    }

    if (type === 'delete') {
      user.isDeleted = true;
      user.status = 'inactive';
      await user.save();

      employer.isDeleted = true;
      employer.status = 'blacklist';
      await employer.save();

      return res.json({ message: 'Recruiter account deleted successfully.' });
    }

    return res.status(400).json({ message: 'Invalid settings update type.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Submit Support Ticket
exports.submitSupportTicket = async (req, res) => {
  try {
    const userId = req.user._id;
    const { subject, priority, message, attachment } = req.body;

    if (!subject || !message) {
      return res.status(400).json({ message: 'Subject and details are required.' });
    }

    const ticket = await SupportTicket.create({
      userId,
      email: req.user.email,
      subject,
      priority: priority || 'Medium',
      message,
      attachment: attachment || ''
    });

    res.status(201).json({
      message: 'Support ticket submitted successfully.',
      ticket
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
