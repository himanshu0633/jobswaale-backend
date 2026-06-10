const Plan = require('../models/Plan');
const { addAuditOnCreate, addAuditOnUpdate } = require('../utils/auditHelper');
const { validateWholeNumber } = require('../utils/masterHelpers');

exports.getPlans = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    const filter = { isDeleted: { $ne: true } };
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

      return res.json({
        docs,
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
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { category, planName, cost, planValidity, planType, displayOrder, startingDate, endDate, features, status } = req.body;
    const normalizedPlanType = planType || 'Free';
    if (!planName || !planValidity) {
      return res.status(400).json({ message: 'planName and planValidity are required' });
    }
    if (normalizedPlanType === 'Paid' && (cost === undefined || cost === null || cost === '')) {
      return res.status(400).json({ message: 'Price is required for paid plans' });
    }
    const sortError = validateWholeNumber(displayOrder, 'Display order');
    if (sortError) return res.status(400).json({ message: sortError });

    const newPlan = new Plan(addAuditOnCreate(req, {
      category: category || 'Jobseeker',
      planName,
      cost: normalizedPlanType === 'Paid' ? Number(cost) : 0,
      planValidity,
      planType: normalizedPlanType,
      displayOrder: Number(displayOrder) || 0,
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
    const { category, planName, cost, planValidity, planType, displayOrder, startingDate, endDate, features, status } = req.body;
    const normalizedPlanType = planType || 'Free';
    if (normalizedPlanType === 'Paid' && (cost === undefined || cost === null || cost === '')) {
      return res.status(400).json({ message: 'Price is required for paid plans' });
    }
    const sortError = validateWholeNumber(displayOrder, 'Display order');
    if (sortError) return res.status(400).json({ message: sortError });

    const updated = await Plan.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, {
        category: category || 'Jobseeker',
        planName,
        cost: normalizedPlanType === 'Paid' ? Number(cost) : 0,
        planValidity,
        planType: normalizedPlanType,
        displayOrder: Number(displayOrder) || 0,
        startingDate,
        endDate,
        features: features || [],
        status
      }),
      { new: true }
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
