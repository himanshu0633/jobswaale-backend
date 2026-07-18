const Jobseeker = require('../models/Jobseeker');
const mongoose = require('mongoose');
const User = require('../models/User');
const Application = require('../models/Application');
const Job = require('../models/Job');
const Plan = require('../models/Plan');
const Payment = require('../models/Payment');
const Qualification = require('../models/Qualification');
const JobCategory = require('../models/JobCategory');
const JobType = require('../models/JobType');
const IndustryType = require('../models/IndustryType');
const PlanMapping = require('../models/PlanMapping');
const Feature = require('../models/Feature');
const Employer = require('../models/Employer');
const { findDuplicateMobile, validateMobileNumber } = require('../utils/userCredentials');

const GOOGLE_PROFILE_DUMMY_VALUES = {
  phone: 'Not Specified',
  gender: 'Male',
  city: 'Delhi',
  state: 'Delhi',
  country: 'India',
  district: 'Delhi',
  address: 'Not Specified',
  pinCode: '110001',
  experience: 'Fresher'
};

const clearGoogleDummyProfileValues = (seeker) => {
  const user = seeker?.userId;
  const isGoogleUser = Boolean(user?.providers?.googleId);
  if (!isGoogleUser) return seeker;

  Object.entries(GOOGLE_PROFILE_DUMMY_VALUES).forEach(([field, dummyValue]) => {
    if (seeker[field] === dummyValue) {
      seeker[field] = '';
    }
  });

  return seeker;
};

const getJobseekerProfileCompletion = (seeker = {}) => {
  const hasValue = (value) => {
    if (Array.isArray(value)) return value.length > 0;
    if (value && typeof value === 'object') return Boolean(value._id || value.id || value.name || value.industryType || value.categoryName || value.jobType);
    return Boolean(String(value || '').trim());
  };

  const profileFields = [
    { key: 'name', label: 'Full name' },
    { key: 'email', label: 'Email address', getValue: (profile) => profile.userId?.email || profile.email },
    { key: 'phone', label: 'Phone number' },
    { key: 'gender', label: 'Gender' },
    { key: 'dob', label: 'Date of birth' },
    { key: 'qualification', label: 'Qualification' },
    { key: 'designation', label: 'Current role' },
    { key: 'experience', label: 'Experience' },
    { key: 'expectedSalary', label: 'Expected salary' },
    { key: 'industryType', label: 'Industry type' },
    { key: 'jobCategory', label: 'Job category' },
    { key: 'jobType', label: 'Job type' },
    { key: 'skills', label: 'Skills' },
    { key: 'preferredLocation', label: 'Preferred location' },
    { key: 'country', label: 'Country' },
    { key: 'state', label: 'State' },
    { key: 'district', label: 'District' },
    { key: 'city', label: 'City' },
    { key: 'address', label: 'Address' },
    { key: 'pinCode', label: 'Pincode' }
  ];
  const socialFields = [
    { key: 'linkedin', label: 'LinkedIn profile' },
    { key: 'portfolio', label: 'Portfolio website' },
    { key: 'github', label: 'GitHub profile' }
  ];

  const profileMissingFields = profileFields
    .filter(({ key, getValue }) => !hasValue(getValue ? getValue(seeker) : seeker[key]))
    .map(({ label }) => label);
  const socialMissingFields = socialFields
    .filter(({ key }) => !hasValue(seeker[key]))
    .map(({ label }) => label);

  const profileCompletedFields = profileFields.length - profileMissingFields.length;
  const socialCompletedFields = socialFields.length - socialMissingFields.length;
  const resumeCompleted = hasValue(seeker.resume);
  const profileFieldsScore = (profileCompletedFields / profileFields.length) * 87;
  const socialLinksScore = (socialCompletedFields / socialFields.length) * 3;
  const resumeScore = resumeCompleted ? 10 : 0;
  const profileCompletionScore = Math.round(profileFieldsScore + socialLinksScore + resumeScore);
  const missingFields = [
    ...profileMissingFields,
    ...socialMissingFields,
    ...(resumeCompleted ? [] : ['Resume'])
  ];

  return {
    profileIncomplete: missingFields.length > 0,
    profileCompletionScore,
    profileMissingFields: missingFields,
    profileCompletionBreakdown: {
      profileFields: {
        completed: profileCompletedFields,
        total: profileFields.length,
        maxScore: 87,
        perFieldScore: Number((87 / profileFields.length).toFixed(2)),
        score: Number(profileFieldsScore.toFixed(2))
      },
      socialLinks: {
        completed: socialCompletedFields,
        total: socialFields.length,
        maxScore: 3,
        perFieldScore: 1,
        score: Number(socialLinksScore.toFixed(2))
      },
      resume: {
        completed: resumeCompleted ? 1 : 0,
        total: 1,
        maxScore: 10,
        score: resumeScore
      }
    }
  };
};

// Helper to ensure a Jobseeker document exists for a user
const ensureJobseekerExists = async (userId) => {
  let seeker = await Jobseeker.findOne({ userId });
  if (!seeker) {
    const user = await User.findById(userId);
    
    seeker = await Jobseeker.findOneAndUpdate(
      { userId },
      {
        $setOnInsert: {
          userId,
          login: userId,
          name: user ? `${user.firstName} ${user.lastName}`.trim() : 'Anonymous',
          phone: user?.phone || '',
          gender: '',
          city: '',
          state: '',
          country: '',
          district: '',
          address: '',
          pinCode: '',
          qualification: null,
          currentPlan: user?.selectedPlan || null,
          experience: user?.workStatus || '',
          status: 'active'
        }
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
  }
  return seeker;
};

// Seeder helper for Jobseeker plans
const seedJobseekerPlansIfEmpty = async (userId) => {
  const count = await Plan.countDocuments({ category: 'Jobseeker', isDeleted: { $ne: true } });
  if (count === 0) {
    const plansToSeed = [
      { planName: 'Free', planSubtitle: 'Start your journey with us', cost: 0, planValidity: 'Always Free', planType: 'Free', category: 'Jobseeker', login: userId },
      { planName: 'Basic', planSubtitle: 'Register & get started', cost: 500, planValidity: 'One Time', planType: 'Paid', category: 'Jobseeker', login: userId },
      { planName: 'Pro', planSubtitle: 'Placement support', cost: 1000, planValidity: 'One Time', planType: 'Paid', category: 'Jobseeker', login: userId },
      { planName: 'Premium', planSubtitle: 'Advanced career support', cost: 5000, planValidity: 'One Time', planType: 'Paid', category: 'Jobseeker', login: userId }
    ];
    await Plan.insertMany(plansToSeed);
  }
};

// Seeder helper for Jobseeker features and mappings
const seedFeaturesAndMappingsIfEmpty = async (userId, plans) => {
  const featureCount = await Feature.countDocuments({ isDeleted: { $ne: true } });
  if (featureCount === 0) {
    const featuresToSeed = [
      { id: 'feat-reg', featureName: 'Candidate Profile Registration', displayOrder: 1, login: userId },
      { id: 'feat-support', featureName: 'Profile Support', displayOrder: 2, login: userId },
      { id: 'feat-offers', featureName: 'Job Offers', displayOrder: 3, login: userId },
      { id: 'feat-alerts', featureName: 'Job Alerts & Vacancy Updates', displayOrder: 4, login: userId },
      { id: 'feat-forward', featureName: 'Profile Forward to Companies', displayOrder: 5, login: userId },
      { id: 'feat-interviews', featureName: 'Multiple Interview Opportunities', displayOrder: 6, login: userId },
      { id: 'feat-prep', featureName: 'Telephonic & Face-to-Face Interview Support', displayOrder: 7, login: userId },
      { id: 'feat-priority', featureName: 'Priority Profile Forwarding', displayOrder: 8, login: userId },
      { id: 'feat-guidance', featureName: 'Guidance for Accounts, Billing & Backend Jobs', displayOrder: 9, login: userId },
      { id: 'feat-updates', featureName: 'Regular Job Updates & Career Support', displayOrder: 10, login: userId },
      { id: 'feat-wfh', featureName: 'Priority Access to WFH & Office Jobs', displayOrder: 11, login: userId },
      { id: 'feat-max-support', featureName: 'Maximum Interview & Placement Support', displayOrder: 12, login: userId },
      { id: 'feat-training', featureName: 'Training on Computer Basics & Accounting', displayOrder: 13, login: userId },
      { id: 'feat-certified', featureName: 'Government Certified Training', displayOrder: 14, login: userId },
      { id: 'feat-assurance', featureName: 'Job Assurance Support', displayOrder: 15, login: userId }
    ];
    const createdFeatures = await Feature.insertMany(featuresToSeed);

    const freePlan = plans.find(p => p.planName.toLowerCase() === 'free');
    const basicPlan = plans.find(p => p.planName.toLowerCase() === 'basic');
    const proPlan = plans.find(p => p.planName.toLowerCase() === 'pro');
    const premiumPlan = plans.find(p => p.planName.toLowerCase() === 'premium');

    const mappings = [];
    
    if (freePlan) {
      mappings.push(
        { plan: freePlan._id, feature: createdFeatures.find(f => f.id === 'feat-reg')._id, value: 'Yes', login: userId },
        { plan: freePlan._id, feature: createdFeatures.find(f => f.id === 'feat-support')._id, value: 'Yes', login: userId },
        { plan: freePlan._id, feature: createdFeatures.find(f => f.id === 'feat-offers')._id, value: 'Limited', login: userId },
        { plan: freePlan._id, feature: createdFeatures.find(f => f.id === 'feat-alerts')._id, value: 'No', login: userId },
        { plan: freePlan._id, feature: createdFeatures.find(f => f.id === 'feat-forward')._id, value: 'No', login: userId }
      );
    }

    if (basicPlan) {
      mappings.push(
        { plan: basicPlan._id, feature: createdFeatures.find(f => f.id === 'feat-reg')._id, value: 'Yes', login: userId },
        { plan: basicPlan._id, feature: createdFeatures.find(f => f.id === 'feat-support')._id, value: 'Yes', login: userId },
        { plan: basicPlan._id, feature: createdFeatures.find(f => f.id === 'feat-offers')._id, value: 'Yes', login: userId },
        { plan: basicPlan._id, feature: createdFeatures.find(f => f.id === 'feat-alerts')._id, value: 'Yes', login: userId },
        { plan: basicPlan._id, feature: createdFeatures.find(f => f.id === 'feat-forward')._id, value: 'Yes', login: userId }
      );
    }

    if (proPlan) {
      mappings.push(
        { plan: proPlan._id, feature: createdFeatures.find(f => f.id === 'feat-interviews')._id, value: 'Yes', login: userId },
        { plan: proPlan._id, feature: createdFeatures.find(f => f.id === 'feat-prep')._id, value: 'Yes', login: userId },
        { plan: proPlan._id, feature: createdFeatures.find(f => f.id === 'feat-priority')._id, value: 'Yes', login: userId },
        { plan: proPlan._id, feature: createdFeatures.find(f => f.id === 'feat-guidance')._id, value: 'Yes', login: userId },
        { plan: proPlan._id, feature: createdFeatures.find(f => f.id === 'feat-updates')._id, value: 'Yes', login: userId }
      );
    }

    if (premiumPlan) {
      mappings.push(
        { plan: premiumPlan._id, feature: createdFeatures.find(f => f.id === 'feat-wfh')._id, value: 'Yes', login: userId },
        { plan: premiumPlan._id, feature: createdFeatures.find(f => f.id === 'feat-interviews')._id, value: 'Yes', login: userId },
        { plan: premiumPlan._id, feature: createdFeatures.find(f => f.id === 'feat-max-support')._id, value: 'Yes', login: userId },
        { plan: premiumPlan._id, feature: createdFeatures.find(f => f.id === 'feat-training')._id, value: 'Yes', login: userId },
        { plan: premiumPlan._id, feature: createdFeatures.find(f => f.id === 'feat-certified')._id, value: 'Yes', login: userId },
        { plan: premiumPlan._id, feature: createdFeatures.find(f => f.id === 'feat-assurance')._id, value: 'Yes', login: userId }
      );
    }

    await PlanMapping.insertMany(mappings);
  }
};

const getNextPaymentId = async () => {
  const lastPayment = await Payment.findOne({ paymentId: /^PAY-\d+$/ })
    .sort({ createDate: -1 })
    .select('paymentId');
  const lastNumber = lastPayment ? Number(lastPayment.paymentId.replace('PAY-', '')) : 0;
  return `PAY-${String(lastNumber + 1).padStart(3, '0')}`;
};

const getNextInvoiceNo = async () => {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const lastPayment = await Payment.findOne({ invoiceNo: new RegExp(`^${prefix}\\d+$`) })
    .sort({ createDate: -1 })
    .select('invoiceNo');
  const lastNumber = lastPayment ? Number(lastPayment.invoiceNo.replace(prefix, '')) : 0;
  return `${prefix}${String(lastNumber + 1).padStart(3, '0')}`;
};

// 1. Dashboard data
exports.getJobseekerDashboard = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);

    // Compute stats
    const jobsAppliedCount = await Application.countDocuments({ candidate: seeker._id });
    const shortlistedCount = await Application.countDocuments({ candidate: seeker._id, status: 'Shortlisted' });
    const interviewsCount = await Application.countDocuments({ candidate: seeker._id, status: 'Interview' });
    
    // Recent activities (applications)
    const recentApps = await Application.find({ candidate: seeker._id })
      .populate({
        path: 'job',
        select: 'jobTitle companyName'
      })
      .sort({ updateDate: -1, appliedDate: -1 })
      .limit(6)
      .lean();

    const recentActivity = recentApps.map(app => {
      let type = 'pending';
      let text = `Application sent for <strong>${app.job?.jobTitle || 'Open Position'}</strong> at ${app.job?.companyName || 'Employer'}`;
      
      if (app.status === 'Shortlisted') {
        type = 'accepted';
        text = `Your application for <strong>${app.job?.jobTitle || 'Open Position'}</strong> was shortlisted`;
      } else if (app.status === 'Interview') {
        type = 'accepted';
        text = `Interview scheduled for <strong>${app.job?.jobTitle || 'Open Position'}</strong>`;
      } else if (app.status === 'Offered') {
        type = 'accepted';
        text = `You received a job offer for <strong>${app.job?.jobTitle || 'Open Position'}</strong>`;
      } else if (app.status === 'Rejected') {
        type = 'rejected';
        text = `Application for <strong>${app.job?.jobTitle || 'Open Position'}</strong> was not selected`;
      }
      
      const timeMs = Date.now() - new Date(app.updateDate || app.appliedDate || Date.now()).getTime();
      const timeHours = Math.floor(timeMs / (1000 * 60 * 60));
      let timeText = 'Just now';
      if (timeHours >= 24) {
        timeText = `${Math.floor(timeHours / 24)} days ago`;
      } else if (timeHours >= 1) {
        timeText = `${timeHours} hours ago`;
      } else {
        const mins = Math.floor(timeMs / (1000 * 60));
        if (mins > 0) timeText = `${mins} mins ago`;
      }

      return { type, text, time: timeText };
    });

    // Populate current plan details
    let planName = 'Free Plan';
    if (seeker.currentPlan) {
      const planDoc = await Plan.findById(seeker.currentPlan);
      if (planDoc) planName = `${planDoc.planName} Plan`;
    }

    // Recommended Jobs
    const unsluggedJobs = await Job.find({ slug: { $exists: false } });
    for (const j of unsluggedJobs) {
      await j.save();
    }

    const recommendedJobsRaw = await Job.find({ status: 'active', isDeleted: { $ne: true } })
      .populate('jobType', 'jobType')
      .populate('jobCategory', 'categoryName')
      .limit(3)
      .lean();

    const recommendedJobs = recommendedJobsRaw.map(job => ({
      id: job.slug || job._id,
      title: job.jobTitle,
      company: job.companyName || 'Hiring Company',
      location: [job.city, job.state].filter(Boolean).join(', ') || job.preferredLocation || 'India',
      salary: job.salary || (job.minSalary ? `₹${(job.minSalary / 100000).toFixed(0)} - ${(job.maxSalary / 100000).toFixed(0)} LPA` : 'Salary not specified'),
      type: job.jobType?.jobType || 'Full Time',
      logo: job.companyName?.charAt(0).toUpperCase() || 'C'
    }));

    res.json({
      user: {
        name: seeker.name,
        initials: seeker.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase() || 'JS',
        role: 'Job Seeker',
        plan: planName
      },
      stats: {
        jobsApplied: { value: jobsAppliedCount, change: 'Lifetime Applications' },
        shortlisted: { value: shortlistedCount, change: 'Moving forward' },
        interviews: { value: interviewsCount, change: 'Scheduled sessions' },
        profileViews: { value: 15 + Math.floor(Math.random() * 20), change: '+3 this week' } // realistic mock views
      },
      recentActivity,
      recommendedJobs
    });
  } catch (error) {
    console.error('Jobseeker Dashboard Error:', error);
    res.status(500).json({ message: 'Server error loading dashboard details' });
  }
};

// 2. Profile Details
exports.getJobseekerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);

    // Populate references if available
    const populatedSeeker = await Jobseeker.findById(seeker._id)
      .populate('userId', 'email firstName lastName phone role accountType status providers')
      .populate('qualification', 'name')
      .populate('jobCategory', 'categoryName')
      .populate('jobType', 'jobType')
      .populate('industryType', 'industryType name industryName')
      .populate('currentPlan', 'planName cost planValidity planType category')
      .lean();

    const cleanedProfile = clearGoogleDummyProfileValues(populatedSeeker);

    res.json({
      ...cleanedProfile,
      ...getJobseekerProfileCompletion(cleanedProfile)
    });
  } catch (error) {
    console.error('Get Jobseeker Profile Error:', error);
    res.status(500).json({ message: 'Server error loading profile details' });
  }
};

// 3. Update Profile
exports.updateJobseekerProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);

    const {
      name,
      phone,
      gender,
      dob,
      city,
      state,
      country,
      district,
      address,
      pinCode,
      designation,
      relocate,
      experience,
      expectedSalary,
      preferredLocation,
      industryType,
      jobCategory,
      jobType,
      bio,
      skills,
      linkedin,
      portfolio,
      github,
      qualification,
      passingYear,
      studyField,
      university
    } = req.body;

    // Update user's name
    if (name) {
      seeker.name = name;
      const nameParts = name.trim().split(/\s+/);
      const firstName = nameParts.shift() || '';
      const lastName = nameParts.join(' ');
      await User.findByIdAndUpdate(userId, { firstName, lastName });
    }

    // Assign fields
    if (phone !== undefined) {
      const normalizedPhone = String(phone || '').trim() ? validateMobileNumber(phone) : '';
      if (normalizedPhone) {
        const phoneExists = await findDuplicateMobile(normalizedPhone, {
          userId,
          jobseekerId: seeker._id
        });
        if (phoneExists) {
          return res.status(400).json({ message: 'Mobile number already exists' });
        }
      }
      seeker.phone = normalizedPhone;
      await User.findByIdAndUpdate(userId, { phone: normalizedPhone });
    }
    if (gender !== undefined) seeker.gender = gender;
    if (dob !== undefined) seeker.dob = dob;
    if (city !== undefined) seeker.city = city;
    if (state !== undefined) seeker.state = state;
    if (country !== undefined) seeker.country = country;
    if (district !== undefined) seeker.district = district;
    if (address !== undefined) seeker.address = address;
    if (pinCode !== undefined) seeker.pinCode = pinCode;
    if (designation !== undefined) seeker.designation = designation;
    if (relocate !== undefined) seeker.relocate = relocate;
    if (experience !== undefined) seeker.experience = experience;
    if (expectedSalary !== undefined) seeker.expectedSalary = expectedSalary;
    if (preferredLocation !== undefined) seeker.preferredLocation = preferredLocation;
    if (bio !== undefined) seeker.bio = bio;
    if (skills !== undefined) seeker.skills = Array.isArray(skills) ? skills : [];
    if (linkedin !== undefined) seeker.linkedin = linkedin;
    if (portfolio !== undefined) seeker.portfolio = portfolio;
    if (github !== undefined) seeker.github = github;
    if (passingYear !== undefined) seeker.passingYear = passingYear;
    if (studyField !== undefined) seeker.studyField = studyField;
    if (university !== undefined) seeker.university = university;

    // Handle Mongoose ObjectID references
    if (qualification) {
      let qualDoc = await Qualification.findById(qualification);
      if (!qualDoc) {
        qualDoc = await Qualification.findOne({ name: qualification });
        if (!qualDoc) qualDoc = await Qualification.create({ name: qualification });
      }
      seeker.qualification = qualDoc._id;
    }

    if (industryType !== undefined) seeker.industryType = mongoose.Types.ObjectId.isValid(industryType) ? industryType : null;
    if (jobCategory !== undefined) seeker.jobCategory = mongoose.Types.ObjectId.isValid(jobCategory) ? jobCategory : null;
    if (jobType !== undefined) seeker.jobType = mongoose.Types.ObjectId.isValid(jobType) ? jobType : null;

    await seeker.save();

    const populated = await Jobseeker.findById(seeker._id)
      .populate('userId', 'email firstName lastName phone role accountType status')
      .populate('qualification', 'name')
      .populate('industryType', 'industryType name industryName')
      .populate('jobCategory', 'categoryName')
      .populate('jobType', 'jobType')
      .populate('currentPlan', 'planName cost planValidity planType category')
      .lean();

    res.json({
      message: 'Profile updated successfully',
      seeker: {
        ...populated,
        ...getJobseekerProfileCompletion(populated)
      }
    });
  } catch (error) {
    console.error('Update Jobseeker Profile Error:', error);
    res.status(500).json({ message: 'Server error updating profile details' });
  }
};

// 4. Subscriptions
exports.getJobseekerSubscription = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);
    await seedJobseekerPlansIfEmpty(userId);

    // Fetch comparison plans
    const allPlans = await Plan.find({ category: 'Jobseeker', isDeleted: { $ne: true } })
      .sort({ cost: 1 })
      .lean();

    // Dynamically seed features and mappings if they are empty
    await seedFeaturesAndMappingsIfEmpty(userId, allPlans);

    // Fetch active plan
    let activePlan = {
      planName: 'Free',
      cost: 0,
      planValidity: 'Always Free',
      planSubtitle: 'Start your journey with us'
    };
    if (seeker.currentPlan) {
      const planDoc = await Plan.findById(seeker.currentPlan);
      if (planDoc) activePlan = planDoc;
    }

    // Fetch all plan mappings
    const mappings = await PlanMapping.find({ plan: { $in: allPlans.map(p => p._id) }, isDeleted: { $ne: true } })
      .populate('feature')
      .lean();

    const plansComparison = allPlans.map(plan => {
      const current = seeker.currentPlan 
        ? String(seeker.currentPlan) === String(plan._id)
        : plan.planName.toLowerCase() === 'free';

      const planMappings = mappings.filter(m => String(m.plan) === String(plan._id));

      const features = planMappings.map(m => {
        if (!m.feature) return null;
        const value = m.value || 'No';
        let state = 'check';
        if (value === 'No') state = 'cross';
        else if (value === 'Limited') state = 'minus';

        return {
          text: value === 'Yes' || value === 'No' ? m.feature.featureName : `${m.feature.featureName} (${value})`,
          state
        };
      }).filter(Boolean);

      return {
        id: plan._id,
        key: plan.planName.toLowerCase(),
        name: plan.planName,
        price: `₹${plan.cost}`,
        period: plan.planValidity.toLowerCase(),
        desc: plan.planSubtitle || 'Advanced career support',
        popular: plan.planName.toLowerCase() === 'pro',
        current,
        features
      };
    });

    // Invoices / billing history
    const payments = await Payment.find({ customer: seeker._id, isDeleted: { $ne: true } })
      .sort({ paymentDate: -1 })
      .lean();

    const billingHistory = payments.map(pay => ({
      date: new Date(pay.paymentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
      plan: pay.planName,
      amount: `₹${pay.paidAmount}`,
      method: pay.paymentMethod,
      status: pay.paymentStatus === 'Success' ? 'Paid' : pay.paymentStatus,
      invoiceNo: pay.invoiceNo
    }));

    // If billingHistory is empty, let's provide a mock item for the initial free plan activation
    if (billingHistory.length === 0) {
      billingHistory.push({
        date: new Date(seeker.createDate || Date.now()).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        plan: `${activePlan.planName} Plan`,
        amount: `₹${activePlan.cost || 0}`,
        method: '-',
        status: 'Paid',
        invoiceNo: 'INV-INITIAL'
      });
    }

    res.json({
      activePlan: {
        name: `${activePlan.planName} Plan`,
        price: `₹${activePlan.cost || 0}`,
        period: activePlan.planValidity.toLowerCase(),
        validity: 'Valid for lifetime · No expiry'
      },
      plans: plansComparison,
      billingHistory
    });
  } catch (error) {
    console.error('Jobseeker Subscriptions Error:', error);
    res.status(500).json({ message: 'Server error loading subscription plans' });
  }
};

// 5. Select/Upgrade Plan
exports.selectJobseekerPlan = async (req, res) => {
  try {
    const userId = req.user._id;
    const { planId } = req.body;
    
    const seeker = await ensureJobseekerExists(userId);
    const plan = await Plan.findById(planId);
    if (!plan) {
      return res.status(404).json({ message: 'Plan not found' });
    }

    // Set plan
    seeker.currentPlan = plan._id;
    seeker.planValidity = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000); // 1 year validity
    await seeker.save();

    // Create payment entry
    const paymentId = await getNextPaymentId();
    const invoiceNo = await getNextInvoiceNo();
    await Payment.create({
      paymentId,
      paymentDate: new Date(),
      userType: 'Jobseeker',
      customer: seeker._id,
      customerModel: 'Jobseeker',
      customerName: seeker.name,
      email: req.user.email,
      phone: seeker.phone || 'Not Specified',
      plan: plan._id,
      planName: `${plan.planName} Plan`,
      planAmount: plan.cost,
      paidAmount: plan.cost,
      paymentMethod: plan.cost > 0 ? 'UPI' : 'Cash',
      paymentGateway: plan.cost > 0 ? 'Razorpay' : 'Cash',
      invoiceNo,
      paymentStatus: 'Success',
      validityType: plan.planValidity === 'Always Free' ? 'Always Free' : 'One Time',
      validFrom: new Date(),
      validTill: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      login: userId
    });

    res.json({ message: `Successfully upgraded to ${plan.planName} Plan`, currentPlan: plan.planName });
  } catch (error) {
    console.error('Select Plan Error:', error);
    res.status(500).json({ message: 'Server error upgrading subscription plan' });
  }
};

// 6. Applied Jobs / Applications
exports.getJobseekerApplications = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);

    const applications = await Application.find({ candidate: seeker._id })
      .populate({
        path: 'job',
        populate: [
          { path: 'jobType', select: 'jobType' },
          { path: 'jobCategory', select: 'categoryName' }
        ]
      })
      .lean();

    const mapped = applications.map((app, index) => {
      const job = app.job;
      if (!job) return null;
      
      const tones = ['bg-[#0d6efd] text-white', 'bg-[#198754] text-white', 'bg-[#ffc107] text-[#212529]', 'bg-[#dc3545] text-white'];
      const appliedDate = app.appliedDate || app.createDate || new Date();

      return {
        id: app._id,
        jobId: job.slug || job._id,
        title: job.jobTitle,
        company: job.companyName || 'Hiring Company',
        initial: job.companyName?.charAt(0).toUpperCase() || 'C',
        color: ['#e63946', '#1d70b8', '#2e7d32', '#e67e22', '#8e44ad'][index % 5],
        location: [job.city, job.state].filter(Boolean).join(', ') || 'N/A',
        appliedOn: new Date(appliedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }),
        status: String(app.status || 'Applied').toLowerCase() === 'offered' ? 'shortlisted' : String(app.status || 'Applied').toLowerCase() // Map offered -> shortlisted or pending matching UI
      };
    }).filter(Boolean);

    res.json(mapped);
  } catch (error) {
    console.error('Get Jobseeker Applications Error:', error);
    res.status(500).json({ message: 'Server error loading applied jobs list' });
  }
};

// 7. Saved Jobs
exports.getJobseekerSavedJobs = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);

    const populated = await Jobseeker.findById(seeker._id)
      .populate({
        path: 'savedJobs',
        populate: { path: 'jobType', select: 'jobType' }
      })
      .lean();

    // Deduplicate jobs on the fly and clean up database if duplicates exist
    const uniqueJobs = [];
    const jobIdsSeen = new Set();
    const cleanSavedJobsIds = [];
    for (const job of (populated.savedJobs || [])) {
      if (!job) continue;
      const jobStrId = String(job._id);
      if (!jobIdsSeen.has(jobStrId)) {
        jobIdsSeen.add(jobStrId);
        uniqueJobs.push(job);
        cleanSavedJobsIds.push(job._id);
      }
    }

    if (populated.savedJobs && cleanSavedJobsIds.length < populated.savedJobs.length) {
      await Jobseeker.findByIdAndUpdate(seeker._id, { savedJobs: cleanSavedJobsIds });
    }

    const saved = uniqueJobs.map((job, index) => {
      const colors = ['bg-[#0d6efd] text-white', 'bg-[#198754] text-white', 'bg-[#ffc107] text-[#212529]', 'bg-[#dc3545] text-white'];
      return {
        id: job.slug || job._id,
        rawId: job._id,
        title: job.jobTitle,
        company: job.companyName || 'Hiring Company',
        initial: job.companyName?.charAt(0).toUpperCase() || 'C',
        tone: colors[index % colors.length],
        location: [job.city, job.state].filter(Boolean).join(', ') || 'N/A',
        type: job.jobType?.jobType || 'Full Time',
        salary: job.salary || (job.minSalary ? `₹${(job.minSalary / 100000).toFixed(0)} - ${(job.maxSalary / 100000).toFixed(0)} LPA` : 'Salary not specified')
      };
    });

    res.json(saved);
  } catch (error) {
    console.error('Get Saved Jobs Error:', error);
    res.status(500).json({ message: 'Server error loading saved jobs list' });
  }
};

// 8. Toggle Save Job
exports.toggleSaveJob = async (req, res) => {
  try {
    const userId = req.user._id;
    const { jobId } = req.params;
    
    const mongoose = require('mongoose');
    const query = mongoose.Types.ObjectId.isValid(jobId)
      ? { $or: [{ _id: jobId }, { slug: jobId }], isDeleted: { $ne: true } }
      : { slug: jobId, isDeleted: { $ne: true } };

    const seeker = await ensureJobseekerExists(userId);
    const job = await Job.findOne(query);
    if (!job) {
      return res.status(404).json({ message: 'Job not found' });
    }

    if (!seeker.savedJobs) {
      seeker.savedJobs = [];
    }

    const index = seeker.savedJobs.findIndex(id => id && id.toString() === job._id.toString());
    let saved = false;
    if (index === -1) {
      seeker.savedJobs.push(job._id);
      saved = true;
    } else {
      seeker.savedJobs.splice(index, 1);
    }

    await seeker.save();
    res.json({ message: saved ? 'Job saved' : 'Job unsaved', saved });
  } catch (error) {
    console.error('Toggle Save Job Error:', error);
    res.status(500).json({ message: 'Server error saving job' });
  }
};

// 9. Saved Employers
exports.getJobseekerSavedEmployers = async (req, res) => {
  try {
    const userId = req.user._id;
    const seeker = await ensureJobseekerExists(userId);

    const populated = await Jobseeker.findById(seeker._id)
      .populate({
        path: 'savedEmployers',
        populate: { path: 'industryType' }
      })
      .lean();

    // Deduplicate employers on the fly and clean up database if duplicates exist
    const uniqueEmployers = [];
    const empIdsSeen = new Set();
    const cleanSavedEmployersIds = [];
    for (const employer of (populated.savedEmployers || [])) {
      if (!employer) continue;
      const empStrId = String(employer._id);
      if (!empIdsSeen.has(empStrId)) {
        empIdsSeen.add(empStrId);
        uniqueEmployers.push(employer);
        cleanSavedEmployersIds.push(employer._id);
      }
    }

    if (populated.savedEmployers && cleanSavedEmployersIds.length < populated.savedEmployers.length) {
      await Jobseeker.findByIdAndUpdate(seeker._id, { savedEmployers: cleanSavedEmployersIds });
    }

    const saved = uniqueEmployers.map((employer, index) => {
      const colors = ['bg-[#0d6efd] text-white', 'bg-[#198754] text-white', 'bg-[#ffc107] text-[#212529]', 'bg-[#dc3545] text-white'];
      return {
        id: employer._id,
        rawId: employer._id,
        name: employer.companyName || 'Employer',
        initial: employer.companyName?.charAt(0).toUpperCase() || 'C',
        tone: colors[index % colors.length],
        location: [employer.city, employer.state].filter(Boolean).join(', ') || 'N/A',
        industry: employer.industryType?.industryType || employer.companyType || 'General',
        website: employer.website || '',
        logoImg: employer.logo || '',
        phone: employer.phone || ''
      };
    });

    res.json(saved);
  } catch (error) {
    console.error('Get Saved Employers Error:', error);
    res.status(500).json({ message: 'Server error loading saved employers list' });
  }
};

// 10. Toggle Save Employer
exports.toggleSaveEmployer = async (req, res) => {
  try {
    const userId = req.user._id;
    const { employerId } = req.params;

    const query = mongoose.Types.ObjectId.isValid(employerId)
      ? { _id: employerId, isDeleted: { $ne: true } }
      : { companyName: employerId, isDeleted: { $ne: true } };

    const seeker = await ensureJobseekerExists(userId);
    const employerDoc = await Employer.findOne(query);
    if (!employerDoc) {
      return res.status(404).json({ message: 'Employer not found' });
    }

    if (!seeker.savedEmployers) {
      seeker.savedEmployers = [];
    }

    const index = seeker.savedEmployers.findIndex(id => id && id.toString() === employerDoc._id.toString());
    let saved = false;
    if (index === -1) {
      seeker.savedEmployers.push(employerDoc._id);
      saved = true;
    } else {
      seeker.savedEmployers.splice(index, 1);
    }

    await seeker.save();
    res.json({ message: saved ? 'Employer saved' : 'Employer unsaved', saved });
  } catch (error) {
    console.error('Toggle Save Employer Error:', error);
    res.status(500).json({ message: 'Server error saving employer' });
  }
};
