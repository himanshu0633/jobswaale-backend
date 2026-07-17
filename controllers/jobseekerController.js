const Jobseeker = require('../models/Jobseeker');
const User = require('../models/User');
const Application = require('../models/Application');
const {
  findDuplicateEmail,
  findDuplicateMobile,
  normalizeEmail,
  validateMobileNumber
} = require('../utils/userCredentials');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification } = require('../utils/mail');

exports.getJobseekers = async (req, res) => {
  try {
    const list = await Jobseeker.find({ isDeleted: { $ne: true } })
      .populate('userId', 'email role status')
      .populate('qualification')
      .populate('industryType')
      .populate('jobCategory')
      .populate('jobType')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email')
      .lean();

    const profileUserIds = new Set(list.map((item) => String(item.userId?._id || item.userId)).filter(Boolean));
    const publicUsersWithoutProfile = await User.find({
      isDeleted: { $ne: true },
      $or: [{ role: 'Jobseeker' }, { accountType: 'jobseeker' }]
    }).select('_id firstName lastName email phone workStatus updatesConsent status createDate updateDate').lean();

    const pendingProfiles = publicUsersWithoutProfile
      .filter((user) => !profileUserIds.has(String(user._id)))
      .map((user) => {
        const fullName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email || 'Jobseeker';
        return {
          _id: user._id,
          userId: {
            _id: user._id,
            email: user.email,
            role: 'Jobseeker',
            status: user.status
          },
          name: fullName,
          phone: user.phone || '',
          workStatus: user.workStatus || '',
          updatesConsent: user.updatesConsent,
          registeredOn: user.createDate || user.updateDate,
          source: 'Public Registration',
          gender: '',
          qualification: null,
          industryType: null,
          jobCategory: null,
          jobType: null,
          experience: user.workStatus || 'Profile pending',
          expectedSalary: '',
          preferredLocation: '',
          country: '',
          state: '',
          district: '',
          city: '',
          address: '',
          pinCode: '',
          currentPlan: null,
          planValidity: null,
          resume: '',
          status: user.status === 'inactive' ? 'pending' : 'active',
          blacklistReason: '',
          createDate: user.createDate,
          updateDate: user.updateDate,
          profileIncomplete: true
        };
      });

    res.json([...list, ...pendingProfiles]);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getJobseekerApplicationHistory = async (req, res) => {
  try {
    const { id } = req.params;

    let jobseeker = await Jobseeker.findById(id)
      .populate('userId', 'email phone firstName lastName')
      .lean();

    if (!jobseeker) {
      jobseeker = await Jobseeker.findOne({ userId: id })
        .populate('userId', 'email phone firstName lastName')
        .lean();
    }

    if (!jobseeker) {
      const user = await User.findOne({
        _id: id,
        isDeleted: { $ne: true },
        $or: [{ role: 'Jobseeker' }, { accountType: 'jobseeker' }]
      }).select('_id firstName lastName email phone').lean();

      if (!user) {
        return res.status(404).json({ message: 'Jobseeker profile not found' });
      }

      return res.json({
        jobseeker: {
          id: user._id,
          name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email || 'Jobseeker',
          email: user.email || '',
          phone: user.phone || ''
        },
        stats: {
          total: 0,
          applied: 0,
          shortlisted: 0,
          interview: 0,
          offered: 0,
          rejected: 0
        },
        history: []
      });
    }

    const applications = await Application.find({ candidate: jobseeker._id })
      .populate({
        path: 'job',
        select: 'jobTitle companyName status jobExpiry city state login',
        populate: { path: 'login', select: 'email firstName lastName companyName' }
      })
      .sort({ appliedDate: -1, createDate: -1 })
      .lean();

    const history = applications.map((application) => {
      const job = application.job;
      const appliedDate = application.appliedDate || application.createDate;
      return {
        id: application._id,
        applicationId: application._id,
        jobId: job?._id || null,
        jobTitle: job?.jobTitle || 'Deleted job',
        employerName: job?.companyName || job?.login?.companyName || [job?.login?.firstName, job?.login?.lastName].filter(Boolean).join(' ') || 'Employer',
        employerEmail: job?.login?.email || '',
        jobLocation: [job?.city, job?.state].filter(Boolean).join(', '),
        jobStatus: job?.status || '',
        jobExpiry: job?.jobExpiry || null,
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
      jobseeker: {
        id: jobseeker._id,
        name: jobseeker.name,
        email: jobseeker.userId?.email || '',
        phone: jobseeker.phone || jobseeker.userId?.phone || ''
      },
      stats: {
        total: history.length,
        applied: history.filter(item => item.applicationStatus === 'Applied').length,
        shortlisted: history.filter(item => item.applicationStatus === 'Shortlisted').length,
        interview: history.filter(item => item.applicationStatus === 'Interview').length,
        offered: history.filter(item => item.applicationStatus === 'Offered').length,
        rejected: history.filter(item => item.applicationStatus === 'Rejected').length
      },
      history
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJobseeker = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      name, 
      phone, 
      gender, 
      qualification, 
      industryType, 
      jobCategory, 
      jobType, 
      experience, 
      expectedSalary, 
      preferredLocation, 
      country, 
      state, 
      district, 
      city, 
      address, 
      pinCode, 
      status, 
      currentPlan, 
      planValidity, 
      resume 
    } = req.body;

    if (!email || !password || !name || !phone || !gender || !qualification || !experience) {
      return res.status(400).json({ message: 'email, password, name, phone, gender, qualification, and experience are required' });
    }

    const normalizedEmail = normalizeEmail(email);
    const userExists = await findDuplicateEmail(normalizedEmail);
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    const normalizedPhone = validateMobileNumber(phone);
    const phoneExists = await findDuplicateMobile(normalizedPhone);
    if (phoneExists) {
      return res.status(400).json({ message: 'Mobile number already exists' });
    }

    // Create user credentials
    const user = await User.create({
      email: normalizedEmail,
      phone: normalizedPhone,
      password,
      role: 'Jobseeker',
      accountType: 'jobseeker',
      status: status === 'blacklist' ? 'inactive' : 'active'
    });

    const jobseeker = new Jobseeker({
      userId: user._id,
      name,
      phone: normalizedPhone,
      gender,
      qualification,
      industryType: industryType || null,
      jobCategory: jobCategory || null,
      jobType: jobType || null,
      experience,
      expectedSalary,
      preferredLocation,
      country,
      state,
      district,
      city,
      address,
      pinCode,
      currentPlan: currentPlan || null,
      planValidity: planValidity || null,
      resume,
      status: status || 'active',
      ip: req.clientIp || '127.0.0.1',
      login: req.user ? req.user._id : user._id
    });

    await jobseeker.save();
    const settings = await getSettings();
    await sendAdminNotification({
      enabled: settings.notifNewApp,
      subject: `New jobseeker registered: ${name}`,
      title: 'New Jobseeker Registration',
      rows: [
        { label: 'Name', value: name },
        { label: 'Email', value: normalizedEmail },
        { label: 'Phone', value: normalizedPhone },
        { label: 'Experience', value: experience },
        { label: 'Status', value: jobseeker.status }
      ]
    });
    res.status(201).json(jobseeker);
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0];
      const message = duplicateField === 'phone'
        ? 'Mobile number already exists'
        : 'User with this email already exists';
      return res.status(400).json({ message });
    }
    res.status(400).json({ message: error.message });
  }
};

exports.updateJobseeker = async (req, res) => {
  try {
    const { id } = req.params;
    const { 
      name, 
      phone, 
      gender, 
      qualification, 
      industryType, 
      jobCategory, 
      jobType, 
      experience, 
      expectedSalary, 
      preferredLocation, 
      country, 
      state, 
      district, 
      city, 
      address, 
      pinCode, 
      status, 
      blacklistReason, 
      currentPlan, 
      planValidity, 
      resume 
    } = req.body;

    const jobseeker = await Jobseeker.findById(id);
    if (!jobseeker) {
      return res.status(404).json({ message: 'Jobseeker profile not found' });
    }

    const normalizedPhone = validateMobileNumber(phone);
    const phoneExists = await findDuplicateMobile(normalizedPhone, {
      userId: jobseeker.userId,
      jobseekerId: jobseeker._id
    });
    if (phoneExists) {
      return res.status(400).json({ message: 'Mobile number already exists' });
    }

    if (status && status !== jobseeker.status) {
      await User.findByIdAndUpdate(jobseeker.userId, {
        status: status === 'blacklist' ? 'inactive' : 'active'
      });
    }

    await User.findByIdAndUpdate(jobseeker.userId, {
      phone: normalizedPhone
    });

    const updated = await Jobseeker.findByIdAndUpdate(
      id,
      {
        name,
        phone: normalizedPhone,
        gender,
        qualification,
        industryType: industryType || null,
        jobCategory: jobCategory || null,
        jobType: jobType || null,
        experience,
        expectedSalary,
        preferredLocation,
        country,
        state,
        district,
        city,
        address,
        pinCode,
        currentPlan: currentPlan || null,
        planValidity: planValidity || null,
        resume,
        status: status || jobseeker.status,
        blacklistReason: status === 'blacklist' ? (blacklistReason || '') : '',
        ip: req.clientIp || '127.0.0.1',
        updatedLogin: req.user ? req.user._id : null
      },
      { returnDocument: 'after' }
    );

    res.json(updated);
  } catch (error) {
    if (error?.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || error.keyValue || {})[0];
      const message = duplicateField === 'phone'
        ? 'Mobile number already exists'
        : 'User with this email already exists';
      return res.status(400).json({ message });
    }
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJobseeker = async (req, res) => {
  try {
    const { id } = req.params;
    const jobseeker = await Jobseeker.findById(id);
    if (!jobseeker) {
      return res.status(404).json({ message: 'Jobseeker profile not found' });
    }

    await User.findByIdAndUpdate(jobseeker.userId, { isDeleted: true, updatedLogin: req.user ? req.user._id : null, ip: req.clientIp || '127.0.0.1' });
    await Jobseeker.findByIdAndUpdate(id, { isDeleted: true, updatedLogin: req.user ? req.user._id : null, ip: req.clientIp || '127.0.0.1' });

    res.json({ message: 'Jobseeker profile deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateJobseekerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, blacklistReason } = req.body;

    const jobseeker = await Jobseeker.findById(id);
    if (!jobseeker) {
      return res.status(404).json({ message: 'Jobseeker profile not found' });
    }

    await User.findByIdAndUpdate(jobseeker.userId, {
      status: status === 'blacklist' ? 'inactive' : 'active'
    });

    jobseeker.status = status;
    jobseeker.blacklistReason = status === 'blacklist' ? (blacklistReason || '') : '';
    jobseeker.updatedLogin = req.user ? req.user._id : null;
    jobseeker.ip = req.clientIp || '127.0.0.1';

    await jobseeker.save();
    res.json(jobseeker);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
