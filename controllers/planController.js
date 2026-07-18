const Plan = require('../models/Plan');
const PlanMapping = require('../models/PlanMapping');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { validateWholeNumber, caseInsensitiveExactFilter } = require('../utils/masterHelpers');
const { seedEmployerPlansIfEmpty } = require('../utils/seedEmployerPlans');

const attachMappedFeatures = async (plans) => {
  const planRows = plans.map(plan => (typeof plan.toObject === 'function' ? plan.toObject() : plan));
  const planIds = planRows.map(plan => plan._id).filter(Boolean);
  if (planIds.length === 0) return planRows;

  const mappings = await PlanMapping.find({
    plan: { $in: planIds },
    isDeleted: { $ne: true },
    status: { $ne: 'inactive' }
  })
    .populate('feature')
    .lean();

  const mappedByPlan = mappings.reduce((acc, mapping) => {
    if (!mapping.feature || mapping.feature.isDeleted || mapping.feature.status === 'inactive') return acc;
    const key = String(mapping.plan);
    if (!acc[key]) acc[key] = [];
    acc[key].push({
      _id: mapping.feature._id,
      featureName: mapping.feature.featureName,
      displayOrder: mapping.feature.displayOrder || 0,
      value: mapping.value || 'Yes'
    });
    return acc;
  }, {});

  return planRows.map(plan => {
    const mappedFeatures = (mappedByPlan[String(plan._id)] || [])
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0));
    return {
      ...plan,
      mappedFeatures,
      features: plan.features?.length ? plan.features : mappedFeatures
    };
  });
};

exports.getPlans = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate, category } = req.query;

    if (category === 'Employer') {
      await seedEmployerPlansIfEmpty();
    }

    const filter = { isDeleted: { $ne: true } };
    if (category) {
      filter.category = category;
    }
    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      if (search) {
        filter.$or = [
          { planName: { $regex: search, $options: 'i' } },
          { planType: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await Plan.countDocuments(filter);
      const docs = await Plan.find(filter)
        .populate('features')
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ displayOrder: 1, cost: 1 })
        .skip(skip)
        .limit(limitNum);
      const docsWithFeatures = await attachMappedFeatures(docs);

      return res.json({
        docs: docsWithFeatures,
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1
      });
    } else {
      const list = await Plan.find(filter)
        .populate('features')
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ planName: 1, cost: 1 });
      const listWithFeatures = await attachMappedFeatures(list);
      res.json(listWithFeatures);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const {
      category,
      planName,
      planSubtitle,
      cost,
      planValidity,
      planType,
      displayOrder,
      startingDate,
      endDate,
      features,
      status,
      unlockCount,
      freeJobPosts,
      autoMailLimit,
      showBadge,
      badge,
      employerFeatures,
      offerEnabled,
      offerTitle,
      offerDescription
    } = req.body;
    const normalizedPlanType = planType || 'Free';
    const normalizedCategory = category || 'Jobseeker';
    if (!planName || !planValidity) {
      return res.status(400).json({ message: 'planName and planValidity are required' });
    }
    const cleanPlanName = planName.trim();
    const nameExists = await Plan.findOne(caseInsensitiveExactFilter('planName', cleanPlanName, { category: normalizedCategory, isDeleted: { $ne: true } }));
    if (nameExists) {
      return res.status(400).json({ message: 'Plan with this Name already exists' });
    }
    if (normalizedPlanType === 'Paid' && (cost === undefined || cost === null || cost === '')) {
      return res.status(400).json({ message: 'Price is required for paid plans' });
    }
    const sortError = validateWholeNumber(displayOrder, 'Display order');
    if (sortError) return res.status(400).json({ message: sortError });

    const newPlan = new Plan(addAuditOnCreate(req, {
      category: normalizedCategory,
      planName: cleanPlanName,
      planSubtitle: String(planSubtitle || '').trim(),
      cost: normalizedPlanType === 'Paid' ? Number(cost) : 0,
      planValidity,
      planType: normalizedPlanType,
      displayOrder: Number(displayOrder) || 0,
      unlockCount: String(unlockCount || '').trim(),
      freeJobPosts: Number(freeJobPosts) || 0,
      autoMailLimit: Number(autoMailLimit) || 0,
      showBadge: Boolean(showBadge),
      badge: String(badge || '').trim(),
      employerFeatures: Array.isArray(employerFeatures) ? employerFeatures.map(item => String(item || '').trim()).filter(Boolean) : [],
      offerEnabled: Boolean(offerEnabled),
      offerTitle: String(offerTitle || '').trim(),
      offerDescription: String(offerDescription || '').trim(),
      startingDate,
      endDate,
      features: features || [],
      status
    }));

    await newPlan.save();
    const populatedPlan = await Plan.findById(newPlan._id).populate('features');
    res.status(201).json(populatedPlan);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const { uid } = req.params;
    const {
      category,
      planName,
      planSubtitle,
      cost,
      planValidity,
      planType,
      displayOrder,
      startingDate,
      endDate,
      features,
      status,
      unlockCount,
      freeJobPosts,
      autoMailLimit,
      showBadge,
      badge,
      employerFeatures,
      offerEnabled,
      offerTitle,
      offerDescription
    } = req.body;
    const normalizedPlanType = planType || 'Free';
    const normalizedCategory = category || 'Jobseeker';
    const cleanPlanName = planName ? planName.trim() : planName;
    if (cleanPlanName) {
      const duplicate = await Plan.findOne(caseInsensitiveExactFilter('planName', cleanPlanName, { _id: { $ne: uid }, category: normalizedCategory, isDeleted: { $ne: true } }));
      if (duplicate) {
        return res.status(400).json({ message: 'Plan with this Name already exists' });
      }
    }
    if (normalizedPlanType === 'Paid' && (cost === undefined || cost === null || cost === '')) {
      return res.status(400).json({ message: 'Price is required for paid plans' });
    }
    const sortError = validateWholeNumber(displayOrder, 'Display order');
    if (sortError) return res.status(400).json({ message: sortError });

    const updated = await Plan.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, {
        category: normalizedCategory,
        planName: cleanPlanName,
        planSubtitle: String(planSubtitle || '').trim(),
        cost: normalizedPlanType === 'Paid' ? Number(cost) : 0,
        planValidity,
        planType: normalizedPlanType,
        displayOrder: Number(displayOrder) || 0,
        unlockCount: String(unlockCount || '').trim(),
        freeJobPosts: Number(freeJobPosts) || 0,
        autoMailLimit: Number(autoMailLimit) || 0,
        showBadge: Boolean(showBadge),
        badge: String(badge || '').trim(),
        employerFeatures: Array.isArray(employerFeatures) ? employerFeatures.map(item => String(item || '').trim()).filter(Boolean) : [],
        offerEnabled: Boolean(offerEnabled),
        offerTitle: String(offerTitle || '').trim(),
        offerDescription: String(offerDescription || '').trim(),
        startingDate,
        endDate,
        features: features || [],
        status
      }),
      { returnDocument: 'after' }
    ).populate('features');

    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deletePlan = async (req, res) => {
  try {
    const { uid } = req.params;
    await Plan.findByIdAndUpdate(uid, addAuditOnUpdate(req, { isDeleted: true }));
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
