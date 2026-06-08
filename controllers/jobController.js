const Job = require('../models/Job');

exports.getJobs = async (req, res) => {
  try {
    const list = await Job.find()
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
      status 
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
      ip: req.clientIp || '127.0.0.1',
      login: req.user ? req.user._id : null
    });

    await job.save();
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
      status 
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
        ip: req.clientIp || '127.0.0.1',
        updatedLogin: req.user ? req.user._id : null
      },
      { new: true }
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

    await Job.findByIdAndDelete(id);
    res.json({ message: 'Job posting deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
