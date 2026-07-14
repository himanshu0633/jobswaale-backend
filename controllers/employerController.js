const Employer = require('../models/Employer');
const User = require('../models/User');
const Job = require('../models/Job');
const mongoose = require('mongoose');
const { validateMobileNumber, findDuplicateMobile } = require('../utils/userCredentials');
const { getSettings } = require('../utils/settings');
const { sendAdminNotification } = require('../utils/mail');

const getLocation = (item) => (
  [item.city, item.state, item.country].filter(Boolean).join(', ') || 'Location not specified'
);

exports.getPublicEmployers = async (req, res) => {
  try {
    const list = await Employer.find({
      isDeleted: { $ne: true },
      status: 'active'
    })
      .populate('userId', 'email role status')
      .populate('industryType')
      .sort({ createDate: -1 })
      .lean();

    const loginIds = list.map((item) => item.login || item.userId?._id || item.userId).filter(Boolean);
    const companyNames = list.map((item) => item.companyName).filter(Boolean);
    const [jobCounts, companyJobCounts] = await Promise.all([
      Job.aggregate([
        {
          $match: {
            login: { $in: loginIds },
            isDeleted: { $ne: true },
            status: { $in: ['active', 'featured'] }
          }
        },
        { $group: { _id: '$login', count: { $sum: 1 } } }
      ]),
      Job.aggregate([
        {
          $match: {
            companyName: { $in: companyNames },
            isDeleted: { $ne: true },
            status: { $in: ['active', 'featured'] }
          }
        },
        { $group: { _id: '$companyName', count: { $sum: 1 } } }
      ])
    ]);
    const jobCountMap = jobCounts.reduce((acc, item) => {
      acc[String(item._id)] = item.count;
      return acc;
    }, {});
    const companyJobCountMap = companyJobCounts.reduce((acc, item) => {
      acc[String(item._id)] = item.count;
      return acc;
    }, {});

    let savedEmployerIds = [];
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
        const Jobseeker = require('../models/Jobseeker');
        const seeker = await Jobseeker.findOne({ userId: decoded.id }).select('savedEmployers').lean();
        if (seeker && seeker.savedEmployers) {
          savedEmployerIds = seeker.savedEmployers.map(id => id.toString());
        }
      } catch (err) {
        console.error('Check saved status in getPublicEmployers error:', err);
      }
    }

    const employers = list.map((item) => {
      const loginId = String(item.login || item.userId?._id || item.userId || '');
      return {
        id: item._id,
        name: item.companyName || 'Employer',
        location: getLocation(item),
        industry: item.industryType?.industryType || item.companyType || 'General',
        openJobs: jobCountMap[loginId] || companyJobCountMap[item.companyName] || 0,
        rating: Number(item.rating || 4.2),
        ratesCount: Number(item.profileViews || 0),
        logoImg: item.logo || '',
        online: item.isVerified === true,
        createdAt: item.createDate,
        hasSaved: savedEmployerIds.includes(item._id.toString())
      };
    });

    res.json(employers);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getPublicEmployerDetail = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ message: 'Employer not found' });
    }

    const employer = await Employer.findOne({
      _id: id,
      isDeleted: { $ne: true },
      status: 'active'
    })
      .populate('userId', 'email role status')
      .populate('industryType')
      .lean();

    if (!employer) {
      return res.status(404).json({ message: 'Employer not found' });
    }

    const loginIds = [employer.login, employer.userId?._id, employer.userId]
      .filter(Boolean)
      .map((item) => item);

    const jobs = await Job.find({
      isDeleted: { $ne: true },
      status: { $in: ['active', 'featured'] },
      $or: [
        { login: { $in: loginIds } },
        { companyName: employer.companyName }
      ]
    })
      .populate('jobCategory')
      .populate('jobType')
      .sort({ postingDate: -1, createDate: -1 })
      .lean();

    const location = getLocation(employer);
    const industry = employer.industryType?.industryType || employer.companyType || 'General';

    let hasSaved = false;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.split(' ')[1];
        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'supersecretjwtkeyforjobswaale123');
        const Jobseeker = require('../models/Jobseeker');
        const seeker = await Jobseeker.findOne({ userId: decoded.id }).select('_id savedEmployers').lean();
        if (seeker) {
          hasSaved = seeker.savedEmployers && seeker.savedEmployers.map(id => id.toString()).includes(employer._id.toString());
        }
      } catch (err) {
        console.error('Check saved employer status error:', err);
        hasSaved = false;
      }
    }

    res.json({
      id: employer._id,
      name: employer.companyName || 'Employer',
      location,
      industry,
      foundedYear: employer.foundedYear || null,
      memberSince: employer.createDate,
      contactPerson: employer.contactPerson || '',
      website: employer.website || '',
      description: employer.description || employer.bio || employer.tagline || '',
      phone: employer.phone || '',
      email: employer.userId?.email || employer.altEmail || '',
      address: [employer.address, employer.city, employer.state, employer.country].filter(Boolean).join(', ') || location,
      logoImg: employer.logo || '',
      online: employer.isVerified === true,
      rating: Number(employer.rating || 4.2),
      ratesCount: Number(employer.profileViews || 0),
      openJobs: jobs.length,
      lastJobPostedAt: jobs[0]?.postingDate || jobs[0]?.createDate || null,
      jobs: jobs.map((job) => ({
        id: job.slug || job._id,
        title: job.jobTitle,
        company: job.companyName,
        location: [job.city, job.state].filter(Boolean).join(', ') || (job.jobLocations || []).join(', ') || 'Location not specified',
        salary: job.salary || (job.minSalary && job.maxSalary ? `₹${job.minSalary} - ${job.maxSalary}` : 'Not Specified'),
        type: job.jobType?.jobType || job.workMode || 'Full Time',
        category: job.jobCategory?.categoryName || '',
        logoLetter: job.companyName ? job.companyName.charAt(0).toUpperCase() : 'J'
      })),
      hasSaved: Boolean(hasSaved)
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getEmployers = async (req, res) => {
  try {
    const list = await Employer.find({ isDeleted: { $ne: true } })
      .populate('userId', 'email role status')
      .populate('industryType')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email')
      .lean();

    const profileUserIds = new Set(list.map((item) => String(item.userId?._id || item.userId)).filter(Boolean));
    const publicUsersWithoutProfile = await User.find({
      isDeleted: { $ne: true },
      $or: [{ role: 'Employer' }, { accountType: 'employer' }]
    }).select('_id firstName lastName email phone companyName designation companyType companySize updatesConsent status createDate updateDate').lean();

    const pendingProfiles = publicUsersWithoutProfile
      .filter((user) => !profileUserIds.has(String(user._id)))
      .map((user) => {
        const contactPerson = `${user.firstName || ''} ${user.lastName || ''}`.trim();
        return {
          _id: user._id,
          userId: {
            _id: user._id,
            email: user.email,
            role: 'Employer',
            status: user.status
          },
          companyName: user.companyName || user.email || 'Employer',
          contactPerson: contactPerson || user.designation || '',
          phone: user.phone || '',
          designation: user.designation || '',
          companyType: user.companyType || '',
          companySize: user.companySize || '',
          updatesConsent: user.updatesConsent,
          registeredOn: user.createDate || user.updateDate,
          source: 'Public Registration',
          industryType: null,
          website: '',
          description: [user.companyType, user.companySize].filter(Boolean).join(' • '),
          country: '',
          state: '',
          district: '',
          city: '',
          address: '',
          pinCode: '',
          currentPlan: null,
          planValidity: null,
          logo: '',
          status: user.status === 'inactive' ? 'pending' : 'active',
          isVerified: false,
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

exports.createEmployer = async (req, res) => {
  try {
    const { 
      email, 
      password, 
      companyName, 
      phone, 
      industryType, 
      country, 
      state, 
      district, 
      city, 
      address, 
      pinCode, 
      status, 
      currentPlan, 
      planValidity, 
      website, 
      description, 
      contactPerson, 
      logo 
    } = req.body;

    if (!email || !password || !companyName || !phone || !industryType) {
      return res.status(400).json({ message: 'Email, password, companyName, phone, and industryType are required' });
    }

    const userExists = await User.findOne({ email });
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
      email,
      phone: normalizedPhone,
      password,
      role: 'Employer',
      accountType: 'employer',
      status: status === 'blacklist' ? 'inactive' : 'active'
    });

    const employer = new Employer({
      userId: user._id,
      companyName,
      contactPerson,
      phone: normalizedPhone,
      industryType,
      website,
      description,
      country,
      state,
      district,
      city,
      address,
      pinCode,
      currentPlan: currentPlan || null,
      planValidity: planValidity || null,
      logo,
      status: status || 'active',
      isVerified: false,
      ip: req.clientIp || '127.0.0.1',
      login: req.user ? req.user._id : user._id
    });

    await employer.save();
    const settings = await getSettings();
    await sendAdminNotification({
      enabled: settings.notifNewEmp,
      subject: `New employer registered: ${companyName}`,
      title: 'New Employer Registration',
      rows: [
        { label: 'Company', value: companyName },
        { label: 'Contact Person', value: contactPerson },
        { label: 'Email', value: email },
        { label: 'Phone', value: normalizedPhone },
        { label: 'Status', value: employer.status }
      ]
    });
    res.status(201).json(employer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateEmployer = async (req, res) => {
  try {
    const { id } = req.params;
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
      status, 
      blacklistReason, 
      currentPlan, 
      planValidity, 
      logo 
    } = req.body;

    const employer = await Employer.findById(id);
    if (!employer) {
      return res.status(404).json({ message: 'Employer profile not found' });
    }

    const normalizedPhone = validateMobileNumber(phone);
    const phoneExists = await findDuplicateMobile(normalizedPhone, {
      userId: employer.userId,
      employerId: employer._id
    });
    if (phoneExists) {
      return res.status(400).json({ message: 'Mobile number already exists' });
    }

    if (status && status !== employer.status) {
      await User.findByIdAndUpdate(employer.userId, {
        status: status === 'blacklist' ? 'inactive' : 'active'
      });
    }

    await User.findByIdAndUpdate(employer.userId, {
      phone: normalizedPhone
    });

    const updated = await Employer.findByIdAndUpdate(
      id,
      {
        companyName,
        contactPerson,
        phone: normalizedPhone,
        industryType,
        website,
        description,
        country,
        state,
        district,
        city,
        address,
        pinCode,
        currentPlan: currentPlan || null,
        planValidity: planValidity || null,
        logo,
        status: status || employer.status,
        isVerified: status === 'blacklist' ? false : employer.isVerified,
        blacklistReason: status === 'blacklist' ? (blacklistReason || '') : '',
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

exports.deleteEmployer = async (req, res) => {
  try {
    const { id } = req.params;
    const employer = await Employer.findById(id);
    if (!employer) {
      return res.status(404).json({ message: 'Employer profile not found' });
    }

    await User.findByIdAndUpdate(employer.userId, { isDeleted: true, updatedLogin: req.user ? req.user._id : null, ip: req.clientIp || '127.0.0.1' });
    await Employer.findByIdAndUpdate(id, { isDeleted: true, updatedLogin: req.user ? req.user._id : null, ip: req.clientIp || '127.0.0.1' });

    res.json({ message: 'Employer profile deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateEmployerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, blacklistReason } = req.body;

    const employer = await Employer.findById(id);
    if (!employer) {
      return res.status(404).json({ message: 'Employer profile not found' });
    }

    await User.findByIdAndUpdate(employer.userId, {
      status: status === 'blacklist' ? 'inactive' : 'active'
    });

    employer.status = status;
    if (status === 'blacklist') {
      employer.isVerified = false;
    }
    employer.blacklistReason = status === 'blacklist' ? (blacklistReason || '') : '';
    employer.updatedLogin = req.user ? req.user._id : null;
    employer.ip = req.clientIp || '127.0.0.1';

    await employer.save();
    res.json(employer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.verifyEmployer = async (req, res) => {
  try {
    const { id } = req.params;

    const employer = await Employer.findById(id);
    if (!employer) {
      return res.status(404).json({ message: 'Employer profile not found' });
    }

    await User.findByIdAndUpdate(employer.userId, {
      status: 'active',
      updatedLogin: req.user ? req.user._id : null,
      ip: req.clientIp || '127.0.0.1'
    });

    employer.status = 'active';
    employer.isVerified = true;
    employer.blacklistReason = '';
    employer.updatedLogin = req.user ? req.user._id : null;
    employer.ip = req.clientIp || '127.0.0.1';

    await employer.save();
    const populated = await Employer.findById(employer._id)
      .populate('userId', 'email role status')
      .populate('industryType')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email')
      .lean();

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.unverifyEmployer = async (req, res) => {
  try {
    const { id } = req.params;

    const employer = await Employer.findById(id);
    if (!employer) {
      return res.status(404).json({ message: 'Employer profile not found' });
    }

    employer.isVerified = false;
    employer.updatedLogin = req.user ? req.user._id : null;
    employer.ip = req.clientIp || '127.0.0.1';

    await employer.save();
    const populated = await Employer.findById(employer._id)
      .populate('userId', 'email role status')
      .populate('industryType')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email')
      .lean();

    res.json(populated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
