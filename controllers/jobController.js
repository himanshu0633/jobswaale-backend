const Job = require('../models/Job');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification } = require('../utils/mail');
const Application = require('../models/Application');
const Jobseeker = require('../models/Jobseeker');

exports.getJobs = async (req, res) => {
  try {
    const jwt = require('jsonwebtoken');
    const User = require('../models/User');
    let isAdmin = false;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (user && (user.role === 'Admin' || user.role === 'SuperAdmin')) {
          isAdmin = true;
        }
      } catch (err) {
        // Ignore invalid token
      }
    }

    const filter = { isDeleted: { $ne: true } };
    if (!isAdmin) {
      filter.status = { $in: ['active', 'featured'] };
    }

    const list = await Job.find(filter)
      .populate('jobCategory')
      .populate('jobType')
      .populate('qualification')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email');
    res.json(list);
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
      description, 
      qualification, 
      experience, 
      salary, 
      salaryNegotiable, 
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

    if (!jobTitle || !jobCategory || !jobType || !vacancies || !description || !experience || !companyName || !email || !phone) {
      return res.status(400).json({ message: 'jobTitle, jobCategory, jobType, vacancies, description, experience, companyName, email, and phone are required' });
    }

    const job = new Job({
      jobTitle,
      jobCategory,
      jobType,
      vacancies,
      workMode,
      description,
      qualification: qualification || null,
      experience,
      salary,
      salaryNegotiable: salaryNegotiable || false,
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
      description, 
      qualification, 
      experience, 
      salary, 
      salaryNegotiable, 
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
        description,
        qualification: qualification || null,
        experience,
        salary,
        salaryNegotiable: salaryNegotiable || false,
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

exports.getJobById = async (req, res) => {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');
    const jwt = require('jsonwebtoken');

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { slug: id }], isDeleted: { $ne: true } }
      : { slug: id, isDeleted: { $ne: true } };

    const jobDoc = await Job.findOne(query)
      .populate('jobCategory')
      .populate('jobType')
      .populate('qualification');

    if (!jobDoc) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const descParas = typeof jobDoc.description === 'string'
      ? jobDoc.description.split('\n').filter(p => p.trim() !== '')
      : [jobDoc.description || ''];

    const respList = typeof jobDoc.responsibilities === 'string' && jobDoc.responsibilities
      ? jobDoc.responsibilities.split('\n').filter(p => p.trim() !== '')
      : ['Translate requirements into clean, performant, and responsive layouts.'];

    const reqsList = typeof jobDoc.screeningQuestions === 'string' && jobDoc.screeningQuestions
      ? jobDoc.screeningQuestions.split('\n').filter(p => p.trim() !== '')
      : [jobDoc.requiredExperience || `Experience Required: ${jobDoc.experience}`];

    const jobFormatted = {
      id: jobDoc._id,
      title: jobDoc.jobTitle,
      company: jobDoc.companyName,
      website: '',
      logo: jobDoc.companyName ? jobDoc.companyName.charAt(0) : 'J',
      location: `${jobDoc.city}, ${jobDoc.state}`,
      salary: jobDoc.salary || (jobDoc.minSalary && jobDoc.maxSalary ? `₹${jobDoc.minSalary} - ${jobDoc.maxSalary}` : 'Not Specified'),
      type: jobDoc.jobType?.jobType || jobDoc.workMode || 'Full Time',
      postedAgo: `Posted on ${new Date(jobDoc.postingDate).toLocaleDateString('en-IN')}`,
      level: jobDoc.workMode || 'Regular',
      experience: jobDoc.experience,
      education: jobDoc.qualification?.name || 'Graduate',
      description: descParas,
      responsibilities: respList,
      requirements: reqsList,
      skills: jobDoc.skills && jobDoc.skills.length > 0 ? jobDoc.skills : ['Communication', 'Team Work']
    };

    const Employer = require('../models/Employer');
    const employerDoc = await Employer.findOne({
      $or: [{ userId: jobDoc.login }, { login: jobDoc.login }],
      isDeleted: { $ne: true }
    }).select('_id').lean();

    const companyFormatted = {
      id: employerDoc?._id || null,
      name: jobDoc.companyName,
      logo: jobDoc.companyName ? jobDoc.companyName.charAt(0) : 'J',
      website: '',
      about: jobDoc.aboutCompany || `${jobDoc.companyName} is a leading provider in their industry.`
    };

    let hasApplied = false;
    let hasSaved = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
        const seeker = await Jobseeker.findOne({ userId: decoded.id }).select('_id savedJobs').lean();
        if (seeker) {
          const existing = await Application.exists({ job: jobDoc._id, candidate: seeker._id });
          hasApplied = Boolean(existing);
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
      hasSaved: Boolean(hasSaved)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
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

    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    const existing = await Application.findOne({ job: job._id, candidate: seeker._id });
    if (existing) {
      return res.status(400).json({ message: 'You have already applied for this job' });
    }

    const app = new Application({
      job: job._id,
      candidate: seeker._id,
      status: 'Applied'
    });
    await app.save();

    res.status(201).json({ message: 'Applied successfully', application: app });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
