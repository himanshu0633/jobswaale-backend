const Job = require('../models/Job');
const Employer = require('../models/Employer');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification } = require('../utils/mail');
const Application = require('../models/Application');
const Jobseeker = require('../models/Jobseeker');
const Attachment = require('../models/Attachment');

const getPublicJobConstraints = () => ({
  status: { $in: ['active', 'featured'] },
  publishStatus: 'publish',
  $or: [
    { jobExpiry: { $exists: false } },
    { jobExpiry: null },
    { jobExpiry: { $gt: new Date() } }
  ]
});

const getPublicOrigin = (req) => {
  const forwardedProto = String(req.get('x-forwarded-proto') || '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';
  return (process.env.PUBLIC_BASE_URL || `${protocol}://${req.get('host')}`).replace(/\/+$/, '');
};

const removeResumeFile = async (resumePath) => {
  if (!resumePath) return;
  try {
    const filename = String(resumePath).split('/').pop();
    if (!filename) return;

    await Attachment.deleteOne({ filename });
    const isVercel = process.env.VERCEL || process.env.NOW_BUILDER;
    const oldFilePath = isVercel
      ? path.join('/tmp', 'uploads', 'resumes', filename)
      : path.join(__dirname, '..', 'uploads', 'resumes', filename);
    if (fs.existsSync(oldFilePath)) {
      fs.unlinkSync(oldFilePath);
    }
  } catch (err) {
    console.error('Failed to remove old resume:', err);
  }
};

const updateJobseekerResumeFromUpload = async (req, seeker) => {
  if (!req.file) return seeker.resume || '';

  await removeResumeFile(seeker.resume);

  const fileData = fs.readFileSync(req.file.path);
  await Attachment.findOneAndUpdate(
    { filename: req.file.filename },
    {
      filename: req.file.filename,
      data: fileData,
      mimeType: req.file.mimetype,
      originalName: req.file.originalname,
      size: req.file.size
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  fs.unlink(req.file.path, () => {});

  seeker.resume = `${getPublicOrigin(req)}/uploads/resumes/${req.file.filename}`;
  await seeker.save();
  return seeker.resume;
};

exports.getJobs = async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    let isAdmin = false;
    let seekerId = null;
    let appliedJobIds = [];
    let applicationStatusMap = {};

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
        const user = await User.findById(decoded.id).select('role accountType').lean();
        if (user && (user.role === 'Admin' || user.role === 'SuperAdmin')) {
          isAdmin = true;
        } else if (user) {
          const seeker = await Jobseeker.findOne({ userId: user._id }).select('_id').lean();
          if (seeker) {
            seekerId = seeker._id;
            const apps = await Application.find({ candidate: seeker._id, isDeleted: { $ne: true } })
              .select('job status')
              .lean();
            appliedJobIds = apps.map((a) => a.job).filter(Boolean);
            apps.forEach((a) => {
              if (a.job) {
                applicationStatusMap[a.job.toString()] = a.status || 'Applied';
              }
            });
          }
        }
      } catch (err) {
        // Ignore invalid token
      }
    }

    const filter = { isDeleted: { $ne: true } };
    if (!isAdmin) {
      const publicConstraints = getPublicJobConstraints();
      if (appliedJobIds.length > 0) {
        filter.$and = filter.$and || [];
        filter.$and.push({
          $or: [
            publicConstraints,
            { _id: { $in: appliedJobIds } }
          ]
        });
      } else {
        filter.$and = filter.$and || [];
        filter.$and.push(publicConstraints);
      }
    }

    if (req.query.employer) {
      if (!mongoose.Types.ObjectId.isValid(req.query.employer)) {
        return res.json([]);
      }

      const employer = await Employer.findOne({
        _id: req.query.employer,
        isDeleted: { $ne: true },
        status: 'active'
      }).lean();

      if (!employer) {
        return res.json([]);
      }

      const loginIds = [employer.login, employer.userId].filter(Boolean);
      filter.$or = [
        ...(loginIds.length ? [{ login: { $in: loginIds } }] : []),
        ...(employer.companyName ? [{ companyName: employer.companyName }] : [])
      ];
    }

    const list = await Job.find(filter)
      .populate('jobCategory')
      .populate('jobType')
      .populate('qualification')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email')
      .sort({ postingDate: -1, createDate: -1 })
      .lean();

    const now = new Date();
    const formattedList = list.map((job) => {
      const jobIdStr = job._id ? job._id.toString() : '';
      const appStatus = applicationStatusMap[jobIdStr] || null;
      const isExpired = Boolean(job.jobExpiry && new Date(job.jobExpiry) < now);

      let displayStatus = 'Active';
      if (job.status === 'closed') displayStatus = 'Closed';
      else if (job.status === 'inactive') displayStatus = 'Inactive';
      else if (isExpired) displayStatus = 'Expired';
      else if (job.status === 'featured') displayStatus = 'Featured';

      return {
        ...job,
        displayStatus,
        isExpired,
        hasApplied: Boolean(appStatus),
        applicationStatus: appStatus
      };
    });

    if (list && list.length > 0) {
      const jobIds = list.map((job) => job._id);
      Job.updateMany({ _id: { $in: jobIds } }, { $inc: { impressions: 1 } }).catch((err) => console.error('Error updating impressions:', err));
    }

    res.json(formattedList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJob = async (req, res) => {
  try {
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
      document,
      status,
      blacklistReason 
    } = req.body;

    if (!jobTitle || !jobCategory || !jobType || !vacancies || !description || !(experience || requiredExperience) || !companyName || !email || !phone) {
      return res.status(400).json({ message: 'jobTitle, jobCategory, jobType, vacancies, description, experience, companyName, email, and phone are required' });
    }

    const job = new Job({
      jobTitle,
      jobCategory,
      jobType,
      vacancies,
      workMode,
      jobLocations: Array.isArray(jobLocations) ? jobLocations : [],
      description,
      jobSummary: jobSummary || '',
      detailedDescription: detailedDescription || description || '',
      responsibilities: responsibilities || '',
      qualification: qualification || null,
      experience: experience || requiredExperience,
      requiredExperience: requiredExperience || experience || '',
      salary,
      minSalary: minSalary ?? null,
      maxSalary: maxSalary ?? null,
      salaryUnit: salaryUnit || '',
      salaryNegotiable: salaryNegotiable || false,
      noticePeriod: noticePeriod || '',
      joiningDate: joiningDate || null,
      shiftTiming: shiftTiming || '',
      jobExpiry: jobExpiry || null,
      benefits: benefits || '',
      aboutCompany: aboutCompany || '',
      skills: Array.isArray(skills) ? skills : [],
      languages: Array.isArray(languages) ? languages : [],
      candidateLocationPreference: candidateLocationPreference || '',
      screeningQuestions: screeningQuestions || '',
      publishStatus: publishStatus || 'publish',
      country,
      state,
      district,
      city,
      companyName,
      contactPerson,
      email,
      phone,
      currentPlan: currentPlan || null,
      planValidity: planValidity || null,
      document,
      status: status || 'active',
      blacklistReason: blacklistReason || '',
      ip: req.clientIp || '127.0.0.1',
      login: req.user ? req.user._id : null
    });

    await job.save();
    
    // Send email to employer and alert jobseekers
    const { sendJobPostedEmail, notifyMatchingJobseekers } = require('../utils/jobNotifications');
    if (job.status === 'active') {
      sendJobPostedEmail({
        to: job.email || req.user.email,
        employerName: job.contactPerson || job.companyName || req.user.firstName || 'Employer',
        jobTitle: job.jobTitle,
        recipientId: req.user?._id || job.login
      }).catch(err => console.error('Failed to send job posted email:', err));

      notifyMatchingJobseekers(job).catch(err => console.error('Failed to notify matching jobseekers:', err));
    }

    const settings = await getSettings();
    await sendAdminNotification({
      enabled: settings.notifNewJob,
      subject: `New job posted: ${jobTitle}`,
      title: 'New Job Posting',
      rows: [
        { label: 'Job Title', value: jobTitle },
        { label: 'Company', value: companyName },
        { label: 'Email', value: email },
        { label: 'Phone', value: phone },
        { label: 'Status', value: job.status }
      ]
    });
    res.status(201).json(job);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateJob = async (req, res) => {
  try {
    const { id } = req.params;
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
      document,
      status,
      blacklistReason 
    } = req.body;

    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ message: 'Job posting not found' });
    }

    const updated = await Job.findByIdAndUpdate(
      id,
      {
        jobTitle,
        jobCategory,
        jobType,
        vacancies,
        workMode,
        jobLocations: Array.isArray(jobLocations) ? jobLocations : [],
        description,
        jobSummary: jobSummary || '',
        detailedDescription: detailedDescription || description || '',
        responsibilities: responsibilities || '',
        qualification: qualification || null,
        experience: experience || requiredExperience,
        requiredExperience: requiredExperience || experience || '',
        salary,
        minSalary: minSalary ?? null,
        maxSalary: maxSalary ?? null,
        salaryUnit: salaryUnit || '',
        salaryNegotiable: salaryNegotiable || false,
        noticePeriod: noticePeriod || '',
        joiningDate: joiningDate || null,
        shiftTiming: shiftTiming || '',
        jobExpiry: jobExpiry || null,
        benefits: benefits || '',
        aboutCompany: aboutCompany || '',
        skills: Array.isArray(skills) ? skills : [],
        languages: Array.isArray(languages) ? languages : [],
        candidateLocationPreference: candidateLocationPreference || '',
        screeningQuestions: screeningQuestions || '',
        publishStatus: publishStatus || job.publishStatus || 'publish',
        country,
        state,
        district,
        city,
        companyName,
        contactPerson,
        email,
        phone,
        currentPlan: currentPlan || null,
        planValidity: planValidity || null,
        document,
        status: status || job.status,
        blacklistReason: blacklistReason || '',
        ip: req.clientIp || '127.0.0.1',
        updatedLogin: req.user ? req.user._id : null
      },
      { returnDocument: 'after' }
    );

    // Send email to employer and alert jobseekers on activation
    const { sendJobPostedEmail, notifyMatchingJobseekers } = require('../utils/jobNotifications');
    if (updated.status === 'active' && job.status !== 'active') {
      sendJobPostedEmail({
        to: updated.email || req.user.email,
        employerName: updated.contactPerson || updated.companyName || req.user.firstName || 'Employer',
        jobTitle: updated.jobTitle,
        recipientId: req.user?._id || updated.login
      }).catch(err => console.error('Failed to send job posted email:', err));

      notifyMatchingJobseekers(updated).catch(err => console.error('Failed to notify matching jobseekers:', err));
    }

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJob = async (req, res) => {
  try {
    const { id } = req.params;
    const job = await Job.findById(id);
    if (!job) {
      return res.status(404).json({ message: 'Job posting not found' });
    }

    await Job.findByIdAndUpdate(id, { isDeleted: true, updatedLogin: req.user ? req.user._id : null, ip: req.clientIp || '127.0.0.1' });
    res.json({ message: 'Job posting deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getJobApplicationHistory = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Job posting not found' });
    }

    const job = await Job.findOne({ _id: id, isDeleted: { $ne: true } })
      .populate('jobCategory', 'categoryName')
      .populate('jobType', 'jobType')
      .populate('qualification', 'name')
      .populate('login', 'email firstName lastName companyName')
      .lean();

    if (!job) {
      return res.status(404).json({ message: 'Job posting not found' });
    }

    const applications = await Application.find({ job: job._id })
      .populate({
        path: 'candidate',
        select: 'name phone city state experience qualification resume status userId',
        populate: [
          { path: 'qualification', select: 'name' },
          { path: 'userId', select: 'email phone firstName lastName' }
        ]
      })
      .sort({ appliedDate: -1, createDate: -1 })
      .lean();

    const applicants = applications.map((application) => {
      const candidate = application.candidate;
      const appliedDate = application.appliedDate || application.createDate;
      return {
        id: application._id,
        applicationId: application._id,
        candidateId: candidate?._id || null,
        candidateName: candidate?.name || [candidate?.userId?.firstName, candidate?.userId?.lastName].filter(Boolean).join(' ') || 'Candidate',
        candidateEmail: candidate?.userId?.email || '',
        candidatePhone: candidate?.phone || candidate?.userId?.phone || '',
        candidateLocation: [candidate?.city, candidate?.state].filter(Boolean).join(', '),
        experience: candidate?.experience || '',
        qualification: candidate?.qualification?.name || '',
        resume: candidate?.resume || '',
        candidateStatus: candidate?.status || '',
        applicationStatus: application.status || 'Applied',
        matchScore: application.matchScore || 0,
        appliedDate,
        appliedDisplayDate: appliedDate ? new Date(appliedDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
        shortlistedDate: application.shortlistedDate || null,
        interviewDetails: application.interviewDetails || null,
        selectionDetails: application.selectionDetails || null
      };
    });

    res.json({
      job: {
        id: job._id,
        title: job.jobTitle,
        company: job.companyName,
        category: job.jobCategory?.categoryName || 'General',
        type: job.jobType?.jobType || job.workMode || 'N/A',
        vacancies: job.vacancies || 0,
        workMode: job.workMode || '',
        experience: job.experience || '',
        salary: job.salary || 'Negotiable',
        location: [job.city, job.state].filter(Boolean).join(', '),
        country: job.country || '',
        contactPerson: job.contactPerson || '',
        email: job.email || job.login?.email || '',
        phone: job.phone || '',
        status: job.status || '',
        postedOn: job.postingDate || job.createDate || null,
        expiry: job.jobExpiry || null,
        description: job.description || ''
      },
      stats: {
        total: applicants.length,
        applied: applicants.filter(item => item.applicationStatus === 'Applied').length,
        shortlisted: applicants.filter(item => item.applicationStatus === 'Shortlisted').length,
        interview: applicants.filter(item => item.applicationStatus === 'Interview').length,
        offered: applicants.filter(item => item.applicationStatus === 'Offered').length,
        rejected: applicants.filter(item => item.applicationStatus === 'Rejected').length
      },
      applicants
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    const jwt = require('jsonwebtoken');

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { slug: id }], isDeleted: { $ne: true } }
      : { slug: id, isDeleted: { $ne: true } };

    const jobDoc = await Job.findOneAndUpdate(
      query,
      { $inc: { views: 1 } },
      { new: true }
    )
      .populate('jobCategory')
      .populate('jobType')
      .populate('qualification');

    if (!jobDoc) {
      return res.status(404).json({ message: 'Job not found' });
    }

    let isAdmin = false;
    let hasAppliedThisJob = false;
    let candidateAppStatus = null;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const User = require('../models/User');
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
        const user = await User.findById(decoded.id).select('role').lean();
        isAdmin = ['Admin', 'SuperAdmin'].includes(user?.role);

        if (!isAdmin) {
          const Jobseeker = require('../models/Jobseeker');
          const seeker = await Jobseeker.findOne({ userId: decoded.id }).select('_id').lean();
          if (seeker) {
            const app = await Application.findOne({ candidate: seeker._id, job: jobDoc._id, isDeleted: { $ne: true } }).lean();
            if (app) {
              hasAppliedThisJob = true;
              candidateAppStatus = app.status || 'Applied';
            }
          }
        }
      } catch {
        isAdmin = false;
      }
    }

    if (req.query.raw === '1' && isAdmin) {
      return res.json({ job: jobDoc });
    }

    const now = new Date();
    const isPubliclyVisible =
      (['active', 'featured'].includes(String(jobDoc.status || '').toLowerCase()) &&
      jobDoc.publishStatus === 'publish' &&
      (!jobDoc.jobExpiry || new Date(jobDoc.jobExpiry) > now)) ||
      hasAppliedThisJob;
    if (!isPubliclyVisible && !isAdmin) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const descParas = typeof jobDoc.description === 'string'
      ? jobDoc.description.split('\n').filter(p => p.trim() !== '')
      : [jobDoc.description || ''];

    const respList = typeof jobDoc.responsibilities === 'string' && jobDoc.responsibilities
      ? jobDoc.responsibilities.split('\n').filter(p => p.trim() !== '')
      : [];

    const reqsList = typeof jobDoc.screeningQuestions === 'string' && jobDoc.screeningQuestions
      ? jobDoc.screeningQuestions.split('\n').filter(p => p.trim() !== '')
      : [jobDoc.requiredExperience || jobDoc.experience].filter(Boolean);

    const benefitsList = typeof jobDoc.benefits === 'string' && jobDoc.benefits
      ? jobDoc.benefits.split('\n').filter(p => p.trim() !== '')
      : [];

    const successfulApplicationsCount = await Application.countDocuments({ job: jobDoc._id });

    const jobFormatted = {
      id: jobDoc._id,
      title: jobDoc.jobTitle,
      company: jobDoc.companyName,
      website: '',
      logo: jobDoc.companyName ? jobDoc.companyName.charAt(0) : 'J',
      location: `${jobDoc.city}, ${jobDoc.state}`,
      salary: jobDoc.salary || (jobDoc.minSalary && jobDoc.maxSalary ? `₹${jobDoc.minSalary} - ${jobDoc.maxSalary}` : 'Not Specified'),
      minSalary: jobDoc.minSalary,
      maxSalary: jobDoc.maxSalary,
      salaryUnit: jobDoc.salaryUnit || '',
      type: jobDoc.jobType?.jobType || jobDoc.workMode || 'Full Time',
      postedAgo: `Posted on ${new Date(jobDoc.postingDate).toLocaleDateString('en-IN')}`,
      workMode: jobDoc.workMode || '',
      level: jobDoc.workMode || '',
      experience: jobDoc.experience,
      education: jobDoc.qualification?.name || '',
      description: descParas,
      responsibilities: respList,
      requirements: reqsList,
      benefits: benefitsList,
      skills: jobDoc.skills && jobDoc.skills.length > 0 ? jobDoc.skills : [],
      applicants: successfulApplicationsCount,
      applicationsCount: successfulApplicationsCount,
      jobExpiry: jobDoc.jobExpiry || null,
      expiry: jobDoc.jobExpiry || null,
      status: jobDoc.status || 'active',
      isExpired: Boolean(jobDoc.jobExpiry && new Date(jobDoc.jobExpiry) < now),
      isClosed: jobDoc.status === 'closed',
      hasApplied: hasAppliedThisJob,
      applicationStatus: candidateAppStatus
    };

    const Employer = require('../models/Employer');
    const employerDoc = await Employer.findOne({
      $or: [{ userId: jobDoc.login }, { login: jobDoc.login }],
      isDeleted: { $ne: true }
    })
      .populate('userId', 'email firstName lastName designation')
      .select('_id logo bannerImage contactPerson phone website altEmail bio userId')
      .lean();

    const contactPerson = employerDoc?.contactPerson ||
      [employerDoc?.userId?.firstName, employerDoc?.userId?.lastName].filter(Boolean).join(' ');

    const companyFormatted = {
      id: employerDoc?._id || null,
      name: jobDoc.companyName,
      logo: employerDoc?.logo || (jobDoc.companyName ? jobDoc.companyName.charAt(0) : 'J'),
      website: employerDoc?.website || '',
      bannerImage: employerDoc?.bannerImage || '',
      about: jobDoc.aboutCompany || employerDoc?.bio || '',
      contactPerson: contactPerson || '',
      contactRole: employerDoc?.userId?.designation || 'Employer',
      phone: employerDoc?.phone || '',
      email: employerDoc?.altEmail || employerDoc?.userId?.email || ''
    };

    let hasApplied = hasAppliedThisJob;
    let hasSaved = false;
    let matchScore = null;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
        const seeker = await Jobseeker.findOne({ userId: decoded.id })
          .select('_id savedJobs skills experience city state preferredLocation relocate qualification')
          .lean();
        if (seeker) {
          const existing = await Application.findOne({ job: jobDoc._id, candidate: seeker._id })
            .select('matchScore')
            .lean();
          hasApplied = Boolean(existing);
          matchScore = existing?.matchScore ?? calculateMatchScore(jobDoc, seeker);
          hasSaved = seeker.savedJobs && seeker.savedJobs.map(id => id.toString()).includes(jobDoc._id.toString());
        }
      } catch {
        hasApplied = false;
        hasSaved = false;
      }
    }

    res.json({
      job: jobFormatted,
      company: companyFormatted,
      hasApplied,
      hasSaved: Boolean(hasSaved),
      matchScore
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

const calculateMatchScore = (job, seeker) => {
  let score = 0;

  // 1. Skills Match (Weight: 40 points)
  if (!job.skills || job.skills.length === 0) {
    score += 40;
  } else if (seeker.skills && seeker.skills.length > 0) {
    const seekerSkillsLower = seeker.skills.map(s => String(s).trim().toLowerCase());
    let matchedSkills = 0;
    job.skills.forEach(skill => {
      if (seekerSkillsLower.includes(String(skill).trim().toLowerCase())) {
        matchedSkills++;
      }
    });
    score += Math.round((matchedSkills / job.skills.length) * 40);
  }

  // 2. Experience Match (Weight: 30 points)
  const normExp = (expStr) => {
    const str = String(expStr || '').toLowerCase().trim();
    if (str.includes('fresher')) return 0;
    const numbers = str.match(/\d+/g);
    if (numbers?.length) return Math.max(...numbers.map(Number));
    return 2; // default average
  };

  const jobExp = normExp(job.experience);
  const seekerExp = normExp(seeker.experience);
  
  if (jobExp === seekerExp) {
    score += 30;
  } else if (seekerExp >= jobExp) {
    score += 25; // seeker has more experience than required
  } else if (Math.abs(seekerExp - jobExp) <= 2) {
    score += 15; // close enough
  } else {
    score += 5;
  }

  // 3. Location Match (Weight: 20 points)
  const jobCity = String(job.city || '').trim().toLowerCase();
  const jobState = String(job.state || '').trim().toLowerCase();
  const seekerCity = String(seeker.city || '').trim().toLowerCase();
  const seekerState = String(seeker.state || '').trim().toLowerCase();
  const preferred = String(seeker.preferredLocation || '').trim().toLowerCase();

  if (jobCity && (jobCity === seekerCity || preferred.includes(jobCity))) {
    score += 20;
  } else if (jobState && (jobState === seekerState || preferred.includes(jobState))) {
    score += 10;
  } else if (seeker.relocate === 'yes') {
    score += 15; // relocation allowed
  } else {
    score += 5;
  }

  // 4. Qualification Match (Weight: 10 points)
  if (!job.qualification) {
    score += 10;
  } else if (seeker.qualification && String(seeker.qualification) === String(job.qualification)) {
    score += 10;
  } else {
    score += 5;
  }

  // Capped between 35 and 100
  return Math.min(100, Math.max(35, score));
};

exports.applyJob = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const seeker = await Jobseeker.findOne({ userId });
    if (!seeker) {
      return res.status(404).json({ message: 'Jobseeker profile not found' });
    }

    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { slug: id }], isDeleted: { $ne: true } }
      : { slug: id, isDeleted: { $ne: true } };

    const job = await Job.findOne({
      isDeleted: { $ne: true },
      $and: [
        query,
        getPublicJobConstraints()
      ]
    });
    if (!job) {
      return res.status(404).json({ message: 'Job is not available for applications' });
    }

    const existing = await Application.findOne({ job: job._id, candidate: seeker._id });
    if (existing) {
      return res.status(400).json({ message: 'You have already applied for this job' });
    }

    const latestResume = await updateJobseekerResumeFromUpload(req, seeker);

    // Calculate match score based on skills, location, experience, and qualification
    const matchScore = calculateMatchScore(job, seeker);

    const app = new Application({
      job: job._id,
      candidate: seeker._id,
      status: 'Applied',
      matchScore
    });
    await app.save();

    // Send email alert to employer
    const { sendEmployerNewApplicationEmail } = require('../utils/jobNotifications');
    const User = require('../models/User');
    User.findById(job.login).select('email firstName').then(employerUser => {
      if (employerUser && employerUser.email) {
        sendEmployerNewApplicationEmail({
          to: employerUser.email,
          employerName: employerUser.firstName || 'Employer',
          jobTitle: job.jobTitle,
          candidateName: seeker.name,
          recipientId: employerUser._id
        }).catch(err => console.error('Failed to send application email to employer:', err));
      }
    }).catch(err => console.error('Failed to query employer for application email:', err));

    res.status(201).json({ message: 'Applied successfully', application: app, resume: latestResume });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
