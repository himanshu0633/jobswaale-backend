const Jobseeker = require('../models/Jobseeker');
const User = require('../models/User');

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
      .populate('updatedLogin', 'email');
    res.json(list);
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

    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User with this email already exists' });
    }

    // Create user credentials
    const user = await User.create({
      email,
      password,
      role: 'Jobseeker',
      status: status === 'blacklist' ? 'inactive' : 'active'
    });

    const jobseeker = new Jobseeker({
      userId: user._id,
      name,
      phone,
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
    res.status(201).json(jobseeker);
  } catch (error) {
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

    if (status && status !== jobseeker.status) {
      await User.findByIdAndUpdate(jobseeker.userId, {
        status: status === 'blacklist' ? 'inactive' : 'active'
      });
    }

    const updated = await Jobseeker.findByIdAndUpdate(
      id,
      {
        name,
        phone,
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
