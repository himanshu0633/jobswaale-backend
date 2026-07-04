const Employer = require('../models/Employer');
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

const formatDate = (value) => {
  if (!value) return null;
  return new Date(value).toISOString();
};

const daysFromNow = (value) => {
  if (!value) return null;
  const diffMs = new Date(value).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
};

const addDays = (date, days) => {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
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
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] || 'C') + (parts[1]?.[0] || parts[0]?.[1] || '');
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
    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .lean();
    return jobs;
  } catch (err) {
    console.error('Error loading employer jobs:', err);
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

const mapCandidate = (candidate, index = 0) => {
  const salary = parseSalaryRange(candidate.expectedSalary);
  const createdAt = candidate.createDate || candidate.createdAt;
  const isRecent = createdAt && (Date.now() - new Date(createdAt).getTime()) <= 7 * 24 * 60 * 60 * 1000;
  const updatedToday = candidate.updateDate && new Date(candidate.updateDate).toDateString() === new Date().toDateString();

  return {
    id: candidate._id,
    name: candidate.name,
    email: candidate.userId?.email || '',
    phone: candidate.phone || '',
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
    activeToday: Boolean(updatedToday),
    resume: candidate.resume || ''
  };
};

const getJobDisplayStatus = (job) => {
  if (job.publishStatus === 'draft' || job.status === 'pending') return 'Draft';
  if (job.status === 'inactive') return 'Paused';
  if (job.status === 'closed') return 'Closed';
  const remainingDays = daysFromNow(job.jobExpiry || job.planValidity);
  if (remainingDays !== null && remainingDays >= 0 && remainingDays <= 7) return 'Expiring';
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
    experience: payload.requiredExperience || payload.experience || '2 - 5 Years',
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
    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .sort({ createDate: -1 })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .lean();

    const mappedJobs = jobs.map((job) => {
      const displayStatus = getJobDisplayStatus(job);
      return {
        id: job._id,
        title: job.jobTitle,
        postDate: formatDate(job.createDate || job.postingDate),
        location: getJobLocationText(job),
        jobType: job.jobType?.jobType || 'N/A',
        expiry: formatDate(job.jobExpiry || job.planValidity),
        status: displayStatus,
        rawStatus: job.status,
        publishStatus: job.publishStatus,
        vacancies: job.vacancies || 0,
        workMode: job.workMode || '',
        category: job.jobCategory?.categoryName || '',
        applications: Math.max(Number(job.vacancies || 0) * 3, 0)
      };
    });

    res.json({
      stats: {
        active: mappedJobs.filter(job => job.status === 'Active').length,
        draft: mappedJobs.filter(job => job.status === 'Draft').length,
        expiring: mappedJobs.filter(job => job.status === 'Expiring').length,
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

    let mapped = candidates.map(mapCandidate);
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
        email: candidate.userId?.email || '',
        phone: candidate.phone || '',
        location: [candidate.city, candidate.state].filter(Boolean).join(', ') || candidate.preferredLocation || 'N/A',
        jobTitle: job.jobTitle || 'Open Position',
        jobType: job.jobType?.jobType || 'Full Time',
        experience: candidate.experience || 'Fresher',
        appliedDate: new Date(appliedDate).toISOString().slice(0, 10),
        displayDate: formatDisplayDate(appliedDate),
        matchScore: app.matchScore || 0,
        status: app.status,
        initials: getInitials(candidate.name).toUpperCase(),
        avatarTone: ['from-rose-200 to-amber-200', 'from-blue-200 to-red-200', 'from-pink-200 to-slate-300', 'from-yellow-200 to-orange-200', 'from-amber-200 to-emerald-200', 'from-sky-200 to-slate-200', 'from-purple-200 to-pink-200'][index % 7],
        interviewDetails: app.interviewDetails || null
      };
    }).filter(Boolean);

    const rawSearch = String(query.search || '').trim().toLowerCase();
    applications = applications.filter((application) => {
      const searchable = [
        application.name,
        application.email,
        application.location,
        application.jobTitle,
        application.jobType,
        application.experience,
        application.status
      ].join(' ').toLowerCase();

      const matchesSearch = !rawSearch || searchable.includes(rawSearch);
      const matchesJob = !query.jobTitle || application.jobTitle === query.jobTitle;
      const matchesStatus = !query.status || application.status === query.status;
      const matchesExperience = !query.experience || application.experience === query.experience;
      const matchesDate = !query.appliedAfter || application.appliedDate >= query.appliedAfter;

      let matchesScore = true;
      if (query.minMatchScore) {
        const minScore = parseInt(query.minMatchScore, 10);
        if (!isNaN(minScore)) {
          matchesScore = application.matchScore >= minScore;
        }
      }

      return matchesSearch && matchesJob && matchesStatus && matchesExperience && matchesDate && matchesScore;
    });

    applications.sort((a, b) => b.appliedDate.localeCompare(a.appliedDate) || b.matchScore - a.matchScore);
    const { items, pagination } = paginate(applications, query.page, query.limit);
    const statusCounts = applications.reduce((acc, item) => ({ ...acc, [item.status]: (acc[item.status] || 0) + 1 }), {});

    res.json({
      stats: {
        total: applications.length,
        new: statusCounts.Applied || 0,
        shortlisted: statusCounts.Shortlisted || 0,
        interviews: statusCounts.Interview || 0,
        rejected: statusCounts.Rejected || 0
      },
      pipeline: {
        applied: statusCounts.Applied || 0,
        reviewed: statusCounts.Reviewed || 0,
        shortlisted: statusCounts.Shortlisted || 0,
        interview: statusCounts.Interview || 0,
        offered: statusCounts.Offered || 0,
        rejected: statusCounts.Rejected || 0
      },
      filters: {
        jobTitles: [...new Set(jobs.map(job => job.jobTitle).filter(Boolean))],
        experiences: [...new Set(applications.map(item => item.experience).filter(Boolean))]
      },
      applications: items,
      pagination
    });
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
        stats: { total: 0, scheduled: 0, completed: 0, rescheduled: 0, cancelled: 0 },
        filters: { jobTitles: [], types: [] },
        interviews: [],
        pagination: { page: 1, limit: Number(query.limit) || 10, total: 0, totalPages: 1 }
      });
    }

    const dbApps = await Application.find({ job: { $in: jobIds }, status: 'Interview' })
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

    const interviews = dbApps.map((app, index) => {
      const candidate = app.candidate;
      const job = app.job;
      if (!candidate || !job) return null;

      const details = app.interviewDetails || {};
      const interviewDate = details.date || app.updateDate || app.appliedDate;
      const interviewStatus = details.status || 'Scheduled';

      return {
        id: app._id,
        applicationId: app._id,
        candidateId: candidate._id,
        jobId: job._id,
        name: candidate.name,
        email: candidate.userId?.email || '',
        phone: candidate.phone || '',
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
      const key = String(item.status || 'Scheduled').toLowerCase();
      return { ...acc, total: acc.total + 1, [key]: (acc[key] || 0) + 1 };
    }, { total: 0, scheduled: 0, completed: 0, rescheduled: 0, cancelled: 0 });

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
        stats: { total: 0, offerSent: 0, offerAccepted: 0, hired: 0, offerDeclined: 0 },
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

    const selectedRows = dbApps.map((app, index) => {
      const candidate = app.candidate;
      const job = app.job;
      if (!candidate || !job) return null;

      const details = app.selectionDetails || {};
      const selectedDate = details.selectedDate || app.updateDate || app.appliedDate;
      const offerStatus = details.offerStatus || 'Offer Sent';
      const salaryLpa = getSalaryLpa(app);

      return {
        id: app._id,
        applicationId: app._id,
        candidateId: candidate._id,
        jobId: job._id,
        name: candidate.name,
        email: candidate.userId?.email || '',
        phone: candidate.phone || '',
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
      if (item.offerStatus === 'Offer Sent') acc.offerSent += 1;
      if (item.offerStatus === 'Offer Accepted') acc.offerAccepted += 1;
      if (item.offerStatus === 'Hired') acc.hired += 1;
      if (item.offerStatus === 'Offer Declined') acc.offerDeclined += 1;
      return { ...acc, total: acc.total + 1 };
    }, { total: 0, offerSent: 0, offerAccepted: 0, hired: 0, offerDeclined: 0 });

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
    const fromDate = query.from ? new Date(query.from) : defaultFrom;
    const toDate = query.to ? new Date(query.to) : now;
    toDate.setHours(23, 59, 59, 999);

    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .select('_id jobTitle jobType postingDate jobExpiry status publishStatus')
      .populate('jobType', 'jobType')
      .lean();
    const jobIds = jobs.map(job => job._id);

    if (!jobIds.length) {
      return res.json({
        range: { from: formatDate(fromDate), to: formatDate(toDate), label: 'No jobs found' },
        stats: { totalApplications: 0, shortlisted: 0, interviews: 0, offersMade: 0, hires: 0, rejectionRate: 0 },
        monthlyOverview: [],
        sources: [],
        funnel: [],
        recentActivity: [],
        topJobs: []
      });
    }

    const apps = await Application.find({
      job: { $in: jobIds },
      appliedDate: { $gte: fromDate, $lte: toDate }
    })
      .populate({
        path: 'candidate',
        populate: { path: 'userId', select: 'email' }
      })
      .populate('job', 'jobTitle jobType')
      .lean();

    const sourceLabel = (app) => app.source || app.candidate?.source || app.candidate?.registrationSource || app.candidate?.leadSource || 'Other';
    const monthFormatter = new Intl.DateTimeFormat('en-IN', { month: 'short' });
    const monthKeys = [];
    for (let index = 5; index >= 0; index -= 1) {
      const date = new Date(toDate.getFullYear(), toDate.getMonth() - index, 1);
      monthKeys.push({
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
        label: monthFormatter.format(date)
      });
    }

    const emptyMonth = () => ({ applied: 0, reviewed: 0, shortlisted: 0, interview: 0, selected: 0, rejected: 0 });
    const monthlyMap = Object.fromEntries(monthKeys.map(item => [item.key, emptyMonth()]));
    const sourceMap = {};
    const jobMap = Object.fromEntries(jobs.map(job => [String(job._id), {
      id: job._id,
      title: job.jobTitle,
      applications: 0,
      shortlisted: 0,
      interviews: 0,
      hired: 0
    }]));

    apps.forEach((app) => {
      const date = new Date(app.appliedDate || app.createDate || now);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const month = monthlyMap[monthKey];
      const status = app.status;
      if (month) {
        month.applied += 1;
        if (status === 'Reviewed') month.reviewed += 1;
        if (status === 'Shortlisted') month.shortlisted += 1;
        if (status === 'Interview') month.interview += 1;
        if (status === 'Offered') month.selected += 1;
        if (status === 'Rejected') month.rejected += 1;
      }

      const source = sourceLabel(app);
      sourceMap[source] = (sourceMap[source] || 0) + 1;

      const jobStats = jobMap[String(app.job?._id || app.job)];
      if (jobStats) {
        jobStats.applications += 1;
        if (status === 'Shortlisted') jobStats.shortlisted += 1;
        if (status === 'Interview') jobStats.interviews += 1;
        if (status === 'Offered' && app.selectionDetails?.offerStatus === 'Hired') jobStats.hired += 1;
      }
    });

    const statusCounts = apps.reduce((acc, app) => ({ ...acc, [app.status]: (acc[app.status] || 0) + 1 }), {});
    const hires = apps.filter(app => app.status === 'Offered' && app.selectionDetails?.offerStatus === 'Hired').length;
    const rejected = statusCounts.Rejected || 0;
    const totalApplications = apps.length;
    const offersMade = statusCounts.Offered || 0;
    const rejectionRate = totalApplications ? Math.round((rejected / totalApplications) * 100) : 0;

    const stats = {
      totalApplications,
      shortlisted: statusCounts.Shortlisted || 0,
      interviews: statusCounts.Interview || 0,
      offersMade,
      hires,
      rejectionRate
    };

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

    const recentApps = [...apps]
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

    res.json({
      range: {
        from: formatDate(fromDate),
        to: formatDate(toDate),
        label: `${formatDisplayDate(fromDate)} - ${formatDisplayDate(toDate)}`
      },
      stats,
      monthlyOverview,
      sources,
      funnel,
      recentActivity,
      topJobs
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployerJobDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const job = await Job.findOne({ _id: req.params.id, login: userId, isDeleted: { $ne: true } })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .populate('qualification', 'name')
      .lean();

    if (!job) {
      return res.status(404).json({ message: 'Job not found.' });
    }

        const status = getJobDisplayStatus(job);
    
    // Ensure applications exist for this employer first
    await ensureApplicationsExist(userId);

    const applications = await Application.countDocuments({ job: job._id });
    const reviewed = await Application.countDocuments({ job: job._id, status: 'Reviewed' });
    const shortlisted = await Application.countDocuments({ job: job._id, status: 'Shortlisted' });
    const interviews = await Application.countDocuments({ job: job._id, status: 'Interview' });
    const selected = await Application.countDocuments({ job: job._id, status: 'Offered' });
    
    const views = Math.max(applications * 26, Number(job.vacancies || 1) * 120);
    const impressions = Math.max(views * 4, views);

    const latestApps = await Application.find({ job: job._id })
      .populate('candidate', 'name userId')
      .populate({ path: 'candidate', populate: { path: 'userId', select: 'email' } })
      .sort({ appliedDate: -1 })
      .limit(5)
      .lean();

    res.json({
      id: job._id,
      title: job.jobTitle,
      status,
      rawStatus: job.status,
      publishStatus: job.publishStatus,
      postDate: formatDate(job.createDate || job.postingDate),
      expiry: formatDate(job.jobExpiry || job.planValidity),
      remainingDays: daysFromNow(job.jobExpiry || job.planValidity),
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
        reviewed,
        shortlisted,
        interviews,
        selected
      },
      recentApplicants: latestApps.map((app, index) => ({
        id: app._id,
        name: app.candidate?.name || 'N/A',
        email: app.candidate?.userId?.email || '',
        appliedAt: formatDate(app.appliedDate || app.createDate),
        matchScore: app.matchScore || 70,
        status: app.status
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

    const allJobs = await Job.find({ login: userId, isDeleted: { $ne: true } }).lean();
    const expiringJobs = allJobs.filter(job => {
      const remainingDays = daysFromNow(job.jobExpiry || job.planValidity);
      return remainingDays !== null && remainingDays >= 0 && remainingDays <= 7;
    });

    const plan = employer?.currentPlan || jobs.find(job => job.currentPlan)?.currentPlan || null;
    const planLimit = Number(plan?.freeJobPosts || 50);
    const jobsUsed = allJobs.length;
    const remainingCredits = Math.max(planLimit - jobsUsed, 0);
    const utilization = planLimit > 0 ? Math.min(Math.round((jobsUsed / planLimit) * 100), 100) : 0;

    // Ensure applications are seeded
    await ensureApplicationsExist(userId);

    const jobIds = allJobs.map(j => j._id);

    const [
      applicationCount,
      appliedCount,
      shortlistedCount,
      selectedCount,
      interviewCount,
      reviewCount,
      rejectedCount
    ] = await Promise.all([
      Application.countDocuments({ job: { $in: jobIds } }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Applied' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Shortlisted' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Offered' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Interview' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Reviewed' }),
      Application.countDocuments({ job: { $in: jobIds }, status: 'Rejected' })
    ]);

    // Group application counts by job and status
    const appCounts = await Application.aggregate([
      { $match: { job: { $in: jobs.map(j => j._id) } } },
      { $group: { _id: { job: "$job", status: "$status" }, count: { $sum: 1 } } }
    ]);

    const countMap = {};
    appCounts.forEach(item => {
      const jobId = String(item._id.job);
      const status = item._id.status;
      if (!countMap[jobId]) {
        countMap[jobId] = { total: 0, shortlisted: 0, interview: 0, selected: 0 };
      }
      countMap[jobId].total += item.count;
      if (status === 'Shortlisted') countMap[jobId].shortlisted += item.count;
      if (status === 'Interview') countMap[jobId].interview += item.count;
      if (status === 'Offered') countMap[jobId].selected += item.count;
    });

    const latestApps = await Application.find({ job: { $in: jobIds } })
      .populate('candidate', 'name userId')
      .populate({ path: 'candidate', populate: { path: 'userId', select: 'email' } })
      .populate('job', 'jobTitle')
      .sort({ appliedDate: -1 })
      .limit(5)
      .lean();

    const interviewApps = await Application.find({ job: { $in: jobIds }, status: 'Interview' })
      .populate('candidate', 'name')
      .populate('job', 'jobTitle')
      .sort({ "interviewDetails.date": 1 })
      .limit(4)
      .lean();

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
        utilization
      },
      actionCenter: {
        newApplications: appliedCount,
        interviews: interviewCount,
        candidates: shortlistedCount,
        jobsExpiring: expiringJobs.length
      },
      pipeline: {
        applied: appliedCount,
        underReview: reviewCount,
        shortlisted: shortlistedCount,
        interview: interviewCount,
        selected: selectedCount,
        notSelected: rejectedCount
      },
      activeJobs: jobs.map(job => {
        const jCounts = countMap[String(job._id)] || { total: 0, shortlisted: 0, interview: 0, selected: 0 };
        return {
          id: job._id,
          title: job.jobTitle,
          location: (job.jobLocations && job.jobLocations.length ? job.jobLocations : [job.city, job.state]).filter(Boolean).join(', '),
          workMode: job.workMode,
          status: job.status,
          applications: jCounts.total,
          shortlisted: jCounts.shortlisted,
          interviews: jCounts.interview,
          selected: jCounts.selected,
          postedAt: formatDate(job.createDate || job.postingDate)
        };
      }),
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
        scheduledAt: app.interviewDetails?.date ? formatDate(app.interviewDetails.date) : formatDate(new Date())
      })),
      recentActivity: [
        { type: 'application', title: 'New Application Received', description: `${latestApps[0]?.candidate?.name || 'Candidate'} applied for ${latestApps[0]?.job?.jobTitle || 'a job'}`, time: '2 minutes ago' },
        { type: 'shortlisted', title: 'Candidate Shortlisted', description: `${latestApps[1]?.candidate?.name || 'Candidate'} shortlisted for ${latestApps[1]?.job?.jobTitle || 'a role'}`, time: '1 hour ago' },
        { type: 'interview', title: 'Interview Scheduled', description: `Interview scheduled for ${interviewApps[0]?.candidate?.name || 'candidate'}`, time: '3 hours ago' },
        { type: 'job', title: 'Job Published', description: `${jobs[0]?.jobTitle || 'Job'} has been published`, time: '5 hours ago' },
        { type: 'expiry', title: 'Job Expiring Soon', description: `${expiringJobs[0]?.jobTitle || 'A job'} is expiring soon`, time: '1 day ago' }
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
    }).populate('currentPlan').lean();

    const plan = employer?.currentPlan || null;

    res.json({
      name: employer?.companyName || req.user.companyName || req.user.firstName || 'Employer',
      status: employer?.status || req.user.status || 'active',
      isVerified: employer?.isVerified === true,
      planName: plan?.planName || 'No Plan',
      planBadge: plan?.badge || plan?.planName || 'No Plan',
      planValidity: employer?.planValidity || null,
      logo: employer?.logo || ''
    });
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
        currentPlan: employer.currentPlan?._id || employer.currentPlan || null,
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
        currentPlan: null,
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
      currentPlan: currentPlan || employer?.currentPlan || null,
      planValidity: planValidity || jobExpiry || employer?.planValidity || null,
      status: finalPublishStatus === 'draft' ? 'pending' : 'active',
      ip: req.clientIp || '127.0.0.1',
      login: userId
    });

    res.status(201).json({ message: 'Job published successfully.', job });
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

    application.status = status;
    if (status === 'Shortlisted') {
      application.shortlistedDate = new Date();
    }
    if (status === 'Offered') {
      const currentDetails = application.selectionDetails || {};
      application.selectionDetails = {
        ...currentDetails,
        selectedDate: currentDetails.selectedDate || new Date(),
        interviewScore: currentDetails.interviewScore ?? application.matchScore ?? null,
        offerStatus: currentDetails.offerStatus || 'Offer Sent',
        salaryOffered: currentDetails.salaryOffered ?? application.job?.maxSalary ?? application.job?.minSalary ?? null,
        offerSentAt: currentDetails.offerSentAt || new Date()
      };
    }
    await application.save();

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

    if (!['Offer Sent', 'Offer Accepted', 'Offer Declined', 'Hired'].includes(offerStatus)) {
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
      offerSentAt: currentDetails.offerSentAt || new Date(),
      offerRespondedAt: ['Offer Accepted', 'Offer Declined'].includes(offerStatus) ? new Date() : currentDetails.offerRespondedAt,
      hiredAt: offerStatus === 'Hired' ? new Date() : currentDetails.hiredAt
    };

    await application.save();

    res.json({ message: `Offer status updated to ${offerStatus}.`, application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.scheduleApplicationInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, type, status, interviewer, locationOrLink, notes } = req.body;

    const application = await Application.findById(id).populate('job', 'login contactPerson');
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    if (String(application.job?.login) !== String(req.user._id)) {
      return res.status(403).json({ message: 'You are not allowed to schedule this application.' });
    }

    const normalizedType = type === 'Telephonic' ? 'Phone Call' : type;

    application.status = 'Interview';
    application.interviewDetails = {
      date: date ? new Date(date) : application.interviewDetails?.date,
      time: time || application.interviewDetails?.time || '',
      type: normalizedType,
      status: status || application.interviewDetails?.status || 'Scheduled',
      interviewer: interviewer || application.interviewDetails?.interviewer || application.job?.contactPerson || req.user.firstName || req.user.companyName || '',
      locationOrLink: locationOrLink ?? application.interviewDetails?.locationOrLink ?? '',
      notes: notes ?? application.interviewDetails?.notes ?? ''
    };

    await application.save();

    res.json({ message: 'Interview scheduled successfully.', application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
