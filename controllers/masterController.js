const Country = require('../models/Country');
const State = require('../models/State');
const District = require('../models/District');
const IndustryType = require('../models/IndustryType');
const JobCategory = require('../models/JobCategory');
const JobType = require('../models/JobType');
const Feature = require('../models/Feature');
const Plan = require('../models/Plan');
const User = require('../models/User');
const Qualification = require('../models/Qualification');
const City = require('../models/City');
const PlanMapping = require('../models/PlanMapping');
const Employer = require('../models/Employer');
const Jobseeker = require('../models/Jobseeker');
const Job = require('../models/Job');

// --- Helper Audit Data Merger ---
const addAuditOnCreate = (req, body = {}) => {
  return {
    ...body,
    ip: req.clientIp || '127.0.0.1',
    login: req.user ? req.user._id : null
  };
};

const addAuditOnUpdate = (req, body = {}) => {
  return {
    ...body,
    ip: req.clientIp || '127.0.0.1',
    updatedLogin: req.user ? req.user._id : null
  };
};

// ==========================================
// 1. Dashboard Stats
// ==========================================
exports.getDashboardStats = async (req, res) => {
  try {
    const employersCount = await Employer.countDocuments();
    const jobseekersCount = await Jobseeker.countDocuments();
    const jobsCount = await Job.countDocuments();
    
    // Sum cost of currentPlan for all Employers and Jobseekers to compute actual revenue
    const employersList = await Employer.find().populate('currentPlan');
    const jobseekersList = await Jobseeker.find().populate('currentPlan');
    
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

// ==========================================
// 2. Country Master CRUD
// ==========================================
exports.getCountries = async (req, res) => {
  try {
    const countries = await Country.find().populate('login', 'email').populate('updatedLogin', 'email');
    res.json(countries);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCountry = async (req, res) => {
  try {
    const { cid, countryName, status } = req.body;
    if (!cid || !countryName) {
      return res.status(400).json({ message: 'cid and countryName are required' });
    }
    
    const exists = await Country.findOne({ $or: [{ cid }, { countryName }] });
    if (exists) {
      return res.status(400).json({ message: 'Country with this CID or Name already exists' });
    }

    const newCountry = new Country(addAuditOnCreate(req, { cid, countryName, status }));
    await newCountry.save();
    res.status(201).json(newCountry);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const { countryName, status } = req.body;
    
    const country = await Country.findById(id);
    if (!country) {
      return res.status(404).json({ message: 'Country not found' });
    }

    const updated = await Country.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { countryName, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const country = await Country.findById(id);
    if (!country) {
      return res.status(404).json({ message: 'Country not found' });
    }
    
    // Cascade delete warning: you can delete children if needed, or simply delete the country
    await Country.findByIdAndDelete(id);
    res.json({ message: 'Country deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 3. State Master CRUD
// ==========================================
exports.getStates = async (req, res) => {
  try {
    const filter = {};
    if (req.query.cid) {
      filter.cid = req.query.cid;
    }
    const states = await State.find(filter).populate('login', 'email').populate('updatedLogin', 'email');
    res.json(states);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createState = async (req, res) => {
  try {
    const { cid, sid, stateName, status } = req.body;
    if (!cid || !sid || !stateName) {
      return res.status(400).json({ message: 'cid, sid, and stateName are required' });
    }

    const exists = await State.findOne({ sid });
    if (exists) {
      return res.status(400).json({ message: 'State with this SID already exists' });
    }

    const newState = new State(addAuditOnCreate(req, { cid, sid, stateName, status }));
    await newState.save();
    res.status(201).json(newState);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateState = async (req, res) => {
  try {
    const { id } = req.params;
    const { cid, stateName, status } = req.body;

    const state = await State.findById(id);
    if (!state) {
      return res.status(404).json({ message: 'State not found' });
    }

    const updated = await State.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { cid, stateName, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteState = async (req, res) => {
  try {
    const { id } = req.params;
    await State.findByIdAndDelete(id);
    res.json({ message: 'State deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 4. District Master CRUD
// ==========================================
exports.getDistricts = async (req, res) => {
  try {
    const filter = {};
    if (req.query.sid) {
      filter.sid = req.query.sid;
    }
    const districts = await District.find(filter).populate('login', 'email').populate('updatedLogin', 'email');
    res.json(districts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createDistrict = async (req, res) => {
  try {
    const { sid, did, districtName, status } = req.body;
    if (!sid || !did || !districtName) {
      return res.status(400).json({ message: 'sid, did, and districtName are required' });
    }

    const exists = await District.findOne({ did });
    if (exists) {
      return res.status(400).json({ message: 'District with this DID already exists' });
    }

    const newDistrict = new District(addAuditOnCreate(req, { sid, did, districtName, status }));
    await newDistrict.save();
    res.status(201).json(newDistrict);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const { sid, districtName, status } = req.body;

    const district = await District.findById(id);
    if (!district) {
      return res.status(404).json({ message: 'District not found' });
    }

    const updated = await District.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { sid, districtName, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    await District.findByIdAndDelete(id);
    res.json({ message: 'District deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 5. Industry Type CRUD
// ==========================================
exports.getIndustryTypes = async (req, res) => {
  try {
    const { page, limit = 10, search = '', paginate } = req.query;

    if (paginate === 'true' || page !== undefined) {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 10;
      const skip = (pageNum - 1) * limitNum;

      // Build search filter on ID and Name
      const filter = {};
      if (search) {
        filter.$or = [
          { id: { $regex: search, $options: 'i' } },
          { industryType: { $regex: search, $options: 'i' } }
        ];
      }

      const total = await IndustryType.countDocuments(filter);
      const docs = await IndustryType.find(filter)
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1 })
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
      const list = await IndustryType.find()
        .populate('login', 'email')
        .populate('updatedLogin', 'email')
        .sort({ sortingNo: 1 });
      res.json(list);
    }
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createIndustryType = async (req, res) => {
  try {
    const { id, industryType, sortingNo, status } = req.body;
    if (!id || !industryType) {
      return res.status(400).json({ message: 'ID and IndustryType name are required' });
    }

    const exists = await IndustryType.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const item = new IndustryType(addAuditOnCreate(req, { id, industryType, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateIndustryType = async (req, res) => {
  try {
    const { uid } = req.params;
    const { industryType, sortingNo, status } = req.body;

    const updated = await IndustryType.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { industryType, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteIndustryType = async (req, res) => {
  try {
    const { uid } = req.params;
    await IndustryType.findByIdAndDelete(uid);
    res.json({ message: 'Industry type deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 6. Job Category CRUD
// ==========================================
exports.getJobCategories = async (req, res) => {
  try {
    const list = await JobCategory.find().populate('login', 'email').populate('updatedLogin', 'email');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJobCategory = async (req, res) => {
  try {
    const { id, categoryName, sortingNo, status } = req.body;
    if (!id || !categoryName) {
      return res.status(400).json({ message: 'ID and CategoryName are required' });
    }

    const exists = await JobCategory.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const item = new JobCategory(addAuditOnCreate(req, { id, categoryName, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    const { categoryName, sortingNo, status } = req.body;

    const updated = await JobCategory.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { categoryName, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJobCategory = async (req, res) => {
  try {
    const { uid } = req.params;
    await JobCategory.findByIdAndDelete(uid);
    res.json({ message: 'Job category deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 7. Job Type CRUD
// ==========================================
exports.getJobTypes = async (req, res) => {
  try {
    const list = await JobType.find().populate('login', 'email').populate('updatedLogin', 'email');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createJobType = async (req, res) => {
  try {
    const { id, jobType, sortingNo, status } = req.body;
    if (!id || !jobType) {
      return res.status(400).json({ message: 'ID and JobType name are required' });
    }

    const exists = await JobType.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const item = new JobType(addAuditOnCreate(req, { id, jobType, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateJobType = async (req, res) => {
  try {
    const { uid } = req.params;
    const { jobType, sortingNo, status } = req.body;

    const updated = await JobType.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { jobType, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteJobType = async (req, res) => {
  try {
    const { uid } = req.params;
    await JobType.findByIdAndDelete(uid);
    res.json({ message: 'Job type deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 8. Feature Master CRUD
// ==========================================
exports.getFeatures = async (req, res) => {
  try {
    const list = await Feature.find().populate('login', 'email').populate('updatedLogin', 'email');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createFeature = async (req, res) => {
  try {
    const { id, featureName, displayOrder, status } = req.body;
    if (!id || !featureName) {
      return res.status(400).json({ message: 'ID and FeatureName are required' });
    }

    const exists = await Feature.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const item = new Feature(addAuditOnCreate(req, { id, featureName, displayOrder, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateFeature = async (req, res) => {
  try {
    const { uid } = req.params;
    const { featureName, displayOrder, status } = req.body;

    const updated = await Feature.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { featureName, displayOrder, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteFeature = async (req, res) => {
  try {
    const { uid } = req.params;
    await Feature.findByIdAndDelete(uid);
    res.json({ message: 'Feature deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 9. Plan Master CRUD
// ==========================================
exports.getPlans = async (req, res) => {
  try {
    const list = await Plan.find().populate('features').populate('login', 'email').populate('updatedLogin', 'email');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const { category, planName, cost, planValidity, startingDate, endDate, features, status } = req.body;
    if (!category || !planName || cost === undefined || !planValidity) {
      return res.status(400).json({ message: 'category, planName, cost, and planValidity are required' });
    }

    const newPlan = new Plan(addAuditOnCreate(req, {
      category,
      planName,
      cost,
      planValidity,
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
    const { category, planName, cost, planValidity, startingDate, endDate, features, status } = req.body;

    const updated = await Plan.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, {
        category,
        planName,
        cost,
        planValidity,
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
    await Plan.findByIdAndDelete(uid);
    res.json({ message: 'Plan deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 10. Qualification Master CRUD
// ==========================================
exports.getQualifications = async (req, res) => {
  try {
    const list = await Qualification.find().populate('login', 'email').populate('updatedLogin', 'email');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createQualification = async (req, res) => {
  try {
    const { id, name, sortingNo, status } = req.body;
    if (!id || !name) {
      return res.status(400).json({ message: 'ID and Name are required' });
    }

    const exists = await Qualification.findOne({ id });
    if (exists) {
      return res.status(400).json({ message: 'Record with this ID already exists' });
    }

    const item = new Qualification(addAuditOnCreate(req, { id, name, sortingNo, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateQualification = async (req, res) => {
  try {
    const { uid } = req.params;
    const { name, sortingNo, status } = req.body;

    const updated = await Qualification.findByIdAndUpdate(
      uid,
      addAuditOnUpdate(req, { name, sortingNo, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteQualification = async (req, res) => {
  try {
    const { uid } = req.params;
    await Qualification.findByIdAndDelete(uid);
    res.json({ message: 'Qualification deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 11. City Master CRUD
// ==========================================
exports.getCities = async (req, res) => {
  try {
    const filter = {};
    if (req.query.did) filter.did = req.query.did;
    if (req.query.sid) filter.sid = req.query.sid;
    if (req.query.cid) filter.cid = req.query.cid;
    
    const list = await City.find(filter).populate('login', 'email').populate('updatedLogin', 'email');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.createCity = async (req, res) => {
  try {
    const { cid, sid, did, ctid, cityName, status } = req.body;
    if (!cid || !sid || !did || !ctid || !cityName) {
      return res.status(400).json({ message: 'cid, sid, did, ctid, and cityName are required' });
    }

    const exists = await City.findOne({ ctid });
    if (exists) {
      return res.status(400).json({ message: 'City with this CTID already exists' });
    }

    const item = new City(addAuditOnCreate(req, { cid, sid, did, ctid, cityName, status }));
    await item.save();
    res.status(201).json(item);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.updateCity = async (req, res) => {
  try {
    const { id } = req.params;
    const { cid, sid, did, cityName, status } = req.body;

    const updated = await City.findByIdAndUpdate(
      id,
      addAuditOnUpdate(req, { cid, sid, did, cityName, status }),
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

exports.deleteCity = async (req, res) => {
  try {
    const { id } = req.params;
    await City.findByIdAndDelete(id);
    res.json({ message: 'City deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ==========================================
// 12. Plan Mapping Master CRUD
// ==========================================
exports.getPlanMappings = async (req, res) => {
  try {
    const list = await PlanMapping.find().populate('plan').populate('feature');
    res.json(list);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.savePlanMappings = async (req, res) => {
  try {
    const mappings = req.body; // Expecting array of { plan, feature, value }
    if (!Array.isArray(mappings)) {
      return res.status(400).json({ message: 'Mappings array is required' });
    }

    const operations = mappings.map(item => {
      const query = { plan: item.plan, feature: item.feature };
      const update = addAuditOnUpdate(req, { value: item.value });
      const onCreate = addAuditOnCreate(req, { plan: item.plan, feature: item.feature, value: item.value });
      return {
        updateOne: {
          filter: query,
          update: { $set: update, $setOnInsert: { login: onCreate.login, ip: onCreate.ip } },
          upsert: true
        }
      };
    });

    if (operations.length > 0) {
      await PlanMapping.bulkWrite(operations);
    }

    res.json({ message: 'Plan mappings saved successfully' });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};
