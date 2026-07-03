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

const getApplicationStatus = (index) => ['Applied', 'Shortlisted', 'Interview', 'Reviewed', 'Rejected', 'Offered'][index % 6];

const getMatchScore = (candidate, job, index) => {
  const candidateText = [
    candidate.jobCategory?.categoryName,
    candidate.industryType?.name,
    candidate.experience,
    candidate.city
  ].filter(Boolean).join(' ').toLowerCase();
  const jobText = [
    job?.jobTitle,
    job?.jobCategory?.categoryName,
    job?.experience,
    job?.requiredExperience,
    job?.city,
    ...(job?.skills || [])
  ].filter(Boolean).join(' ').toLowerCase();
  let score = 68 + ((index * 7) % 25);
  if (candidate.jobCategory && String(candidate.jobCategory?._id || candidate.jobCategory) === String(job?.jobCategory?._id || job?.jobCategory)) score += 8;
  if (candidateText && jobText && candidateText.split(/\s+/).some(word => word.length > 3 && jobText.includes(word))) score += 6;
  return Math.min(score, 98);
};

const ensureApplicationsExist = async (userId) => {
  try {
    const jobs = await Job.find({ login: userId, isDeleted: { $ne: true } })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .lean();
    if (!jobs.length) return [];

    const jobIds = jobs.map(j => j._id);
    const existingCount = await Application.countDocuments({ job: { $in: jobIds } });

    if (existingCount > 0) {
      return jobs;
    }

    const candidates = await Jobseeker.find({ isDeleted: { $ne: true }, status: { $ne: 'blacklist' } })
      .populate('userId', 'email')
      .populate('qualification', 'name')
      .populate('jobCategory', 'categoryName')
      .lean();

    if (!candidates.length) return jobs;

    const applicationsToInsert = candidates.map((candidate, index) => {
      const job = jobs[index % jobs.length];
      const status = getApplicationStatus(index);
      const appliedDate = candidate.createDate || candidate.updateDate || new Date();
      
      let shortlistedDate = null;
      if (['Shortlisted', 'Interview', 'Offered'].includes(status)) {
        shortlistedDate = addDays(appliedDate, 2);
      }

      return {
        job: job._id,
        candidate: candidate._id,
        status,
        matchScore: getMatchScore(candidate, job, index),
        appliedDate,
        shortlistedDate,
        interviewDetails: status === 'Interview' ? {
          date: addDays(appliedDate, 5),
          time: '14:00',
          type: 'Video Call',
          locationOrLink: 'https://zoom.us/j/mock-interview-meeting',
          notes: 'Technical discussion and evaluation.'
        } : undefined
      };
    });

    if (applicationsToInsert.length) {
      await Application.insertMany(applicationsToInsert);
    }

    return jobs;
  } catch (err) {
    console.error('Error seeding applications:', err);
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

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    application.status = status;
    if (status === 'Shortlisted') {
      application.shortlistedDate = new Date();
    }
    await application.save();

    res.json({ message: `Candidate status updated to ${status} successfully.`, application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.scheduleApplicationInterview = async (req, res) => {
  try {
    const { id } = req.params;
    const { date, time, type, locationOrLink, notes } = req.body;

    const application = await Application.findById(id);
    if (!application) {
      return res.status(404).json({ message: 'Application not found.' });
    }

    application.status = 'Interview';
    application.interviewDetails = {
      date: date ? new Date(date) : undefined,
      time,
      type,
      locationOrLink,
      notes
    };

    await application.save();

    res.json({ message: 'Interview scheduled successfully.', application });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
