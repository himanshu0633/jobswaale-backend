const Plan = require('../models/Plan');
const User = require('../models/User');

const employerPlanSeeds = [
  {
    category: 'Employer',
    planName: 'Basic Weekly',
    planSubtitle: 'Best for small businesses',
    planType: 'Paid',
    planValidity: 'Weekly',
    cost: 499,
    unlockCount: '25',
    freeJobPosts: 2,
    showBadge: true,
    badge: 'BEST VALUE',
    employerFeatures: ['Direct Contact Access', 'Employer Dashboard'],
    offerEnabled: true,
    offerTitle: 'FIRST TIME OFFER',
    offerDescription: 'Weekly Plan FREE with your First Job Post',
    displayOrder: 1,
    status: 'active'
  },
  {
    category: 'Employer',
    planName: 'Pro Monthly',
    planSubtitle: 'For growing hiring teams',
    planType: 'Paid',
    planValidity: 'Monthly',
    cost: 1499,
    unlockCount: '100',
    freeJobPosts: 10,
    showBadge: true,
    badge: 'MOST POPULAR',
    employerFeatures: ['Direct Contact Access', 'Employer Dashboard', 'Priority Support'],
    displayOrder: 2,
    status: 'active'
  },
  {
    category: 'Employer',
    planName: 'Enterprise Quarterly',
    planSubtitle: 'For high-volume recruiting',
    planType: 'Paid',
    planValidity: 'Quarterly',
    cost: 3999,
    unlockCount: '300',
    freeJobPosts: 30,
    showBadge: true,
    badge: 'ENTERPRISE CHOICE',
    employerFeatures: ['Direct Contact Access', 'Employer Dashboard', 'Priority Support', 'Candidate Tracking'],
    displayOrder: 3,
    status: 'active'
  },
  {
    category: 'Employer',
    planName: 'Premium Yearly',
    planSubtitle: 'Best annual value',
    planType: 'Paid',
    planValidity: 'Yearly',
    cost: 9999,
    unlockCount: 'Unlimited',
    freeJobPosts: 100,
    showBadge: true,
    badge: 'PREMIUM',
    employerFeatures: ['Direct Contact Access', 'Employer Dashboard', 'Priority Support', 'Candidate Tracking'],
    displayOrder: 4,
    status: 'active'
  },
  {
    category: 'Employer',
    planName: 'Starter Weekly',
    planSubtitle: 'Starter plan for small hiring needs',
    planType: 'Paid',
    planValidity: 'Weekly',
    cost: 199,
    unlockCount: '10',
    freeJobPosts: 1,
    showBadge: true,
    badge: 'BASIC',
    employerFeatures: ['Direct Contact Access'],
    displayOrder: 5,
    status: 'inactive'
  }
];

const seedEmployerPlansIfEmpty = async () => {
  const existingCount = await Plan.countDocuments({ category: 'Employer', isDeleted: { $ne: true } });
  if (existingCount > 0) return;

  const admin = await User.findOne({ role: 'Admin', isDeleted: { $ne: true } }).sort({ createDate: 1 });
  if (!admin) return;

  await Plan.insertMany(employerPlanSeeds.map((plan) => ({
    ...plan,
    login: admin._id,
    ip: '127.0.0.1'
  })));
};

module.exports = {
  seedEmployerPlansIfEmpty
};
