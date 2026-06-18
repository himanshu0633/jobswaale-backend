const Employer = require('../models/Employer');
const User = require('../models/User');

exports.getEmployers = async (req, res) => {
  try {
    const list = await Employer.find({ isDeleted: { $ne: true } })
      .populate('userId', 'email role status')
      .populate('industryType')
      .populate('currentPlan')
      .populate('login', 'email')
      .populate('updatedLogin', 'email');
    res.json(list);
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

    // Create user credentials
    const user = await User.create({
      email,
      password,
      role: 'Employer',
      status: status === 'blacklist' ? 'inactive' : 'active'
    });

    const employer = new Employer({
      userId: user._id,
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
      currentPlan: currentPlan || null,
      planValidity: planValidity || null,
      logo,
      status: status || 'active',
      ip: req.clientIp || '127.0.0.1',
      login: req.user ? req.user._id : user._id
    });

    await employer.save();
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

    if (status && status !== employer.status) {
      await User.findByIdAndUpdate(employer.userId, {
        status: status === 'blacklist' ? 'inactive' : 'active'
      });
    }

    const updated = await Employer.findByIdAndUpdate(
      id,
      {
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
        currentPlan: currentPlan || null,
        planValidity: planValidity || null,
        logo,
        status: status || employer.status,
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
    employer.blacklistReason = status === 'blacklist' ? (blacklistReason || '') : '';
    employer.updatedLogin = req.user ? req.user._id : null;
    employer.ip = req.clientIp || '127.0.0.1';

    await employer.save();
    res.json(employer);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
