const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');
const Job = require('../models/Job');

exports.getDashboardStats = async (req, res) => {
  try {
    const employersCount = await Employer.countDocuments({ isDeleted: { $ne: true } });
    const jobseekersCount = await Jobseeker.countDocuments({ isDeleted: { $ne: true } });
    const jobsCount = await Job.countDocuments({ isDeleted: { $ne: true } });
    
    // Sum cost of currentPlan for all Employers and Jobseekers to compute actual revenue
    const employersList = await Employer.find({ isDeleted: { $ne: true } }).populate('currentPlan');
    const jobseekersList = await Jobseeker.find({ isDeleted: { $ne: true } }).populate('currentPlan');
    
    let totalRevenue = 0;
    employersList.forEach(emp => {
      if (emp.currentPlan && typeof emp.currentPlan.cost === 'number') {
        totalRevenue += emp.currentPlan.cost;
      }
    });
    jobseekersList.forEach(js => {
      if (js.currentPlan && typeof js.currentPlan.cost === 'number') {
        totalRevenue += js.currentPlan.cost;
      }
    });
    
    res.json({
      employers: employersCount,
      jobseekers: jobseekersCount,
      jobsPosted: jobsCount,
      revenue: totalRevenue
    });
  } catch (error) {
    console.error('Stats Error:', error);
    res.status(500).json({ message: 'Error fetching stats' });
  }
};
