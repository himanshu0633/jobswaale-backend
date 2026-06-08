const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { auditMiddleware } = require('../middleware/audit');
const {
  getDashboardStats,
  // Country
  getCountries,
  createCountry,
  updateCountry,
  deleteCountry,
  // State
  getStates,
  createState,
  updateState,
  deleteState,
  // District
  getDistricts,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  // Industry Type
  getIndustryTypes,
  createIndustryType,
  updateIndustryType,
  deleteIndustryType,
  // Job Category
  getJobCategories,
  createJobCategory,
  updateJobCategory,
  deleteJobCategory,
  // Job Type
  getJobTypes,
  createJobType,
  updateJobType,
  deleteJobType,
  // Feature
  getFeatures,
  createFeature,
  updateFeature,
  deleteFeature,
  // Plan
  getPlans,
  createPlan,
  updatePlan,
  deletePlan,
  // Qualification
  getQualifications,
  createQualification,
  updateQualification,
  deleteQualification,
  // City
  getCities,
  createCity,
  updateCity,
  deleteCity,
  // PlanMapping
  getPlanMappings,
  savePlanMappings
} = require('../controllers/masterController');

// All master routes require JWT auth
router.use(protect);

// Dashboard stats (accessible to Admins)
router.get('/dashboard/stats', authorize('Admin'), getDashboardStats);

// --- Countries ---
router.get('/countries', getCountries);
router.post('/countries', authorize('Admin'), auditMiddleware, createCountry);
router.put('/countries/:id', authorize('Admin'), auditMiddleware, updateCountry);
router.delete('/countries/:id', authorize('Admin'), deleteCountry);

// --- States ---
router.get('/states', getStates);
router.post('/states', authorize('Admin'), auditMiddleware, createState);
router.put('/states/:id', authorize('Admin'), auditMiddleware, updateState);
router.delete('/states/:id', authorize('Admin'), deleteState);

// --- Districts ---
router.get('/districts', getDistricts);
router.post('/districts', authorize('Admin'), auditMiddleware, createDistrict);
router.put('/districts/:id', authorize('Admin'), auditMiddleware, updateDistrict);
router.delete('/districts/:id', authorize('Admin'), deleteDistrict);

// --- Industry Types ---
router.get('/industry-types', getIndustryTypes);
router.post('/industry-types', authorize('Admin'), auditMiddleware, createIndustryType);
router.put('/industry-types/:uid', authorize('Admin'), auditMiddleware, updateIndustryType);
router.delete('/industry-types/:uid', authorize('Admin'), deleteIndustryType);

// --- Job Categories ---
router.get('/job-categories', getJobCategories);
router.post('/job-categories', authorize('Admin'), auditMiddleware, createJobCategory);
router.put('/job-categories/:uid', authorize('Admin'), auditMiddleware, updateJobCategory);
router.delete('/job-categories/:uid', authorize('Admin'), deleteJobCategory);

// --- Job Types ---
router.get('/job-types', getJobTypes);
router.post('/job-types', authorize('Admin'), auditMiddleware, createJobType);
router.put('/job-types/:uid', authorize('Admin'), auditMiddleware, updateJobType);
router.delete('/job-types/:uid', authorize('Admin'), deleteJobType);

// --- Features ---
router.get('/features', getFeatures);
router.post('/features', authorize('Admin'), auditMiddleware, createFeature);
router.put('/features/:uid', authorize('Admin'), auditMiddleware, updateFeature);
router.delete('/features/:uid', authorize('Admin'), deleteFeature);

// --- Plans ---
router.get('/plans', getPlans);
router.post('/plans', authorize('Admin'), auditMiddleware, createPlan);
router.put('/plans/:uid', authorize('Admin'), auditMiddleware, updatePlan);
router.delete('/plans/:uid', authorize('Admin'), deletePlan);

// --- Qualifications ---
router.get('/qualifications', getQualifications);
router.post('/qualifications', authorize('Admin'), auditMiddleware, createQualification);
router.put('/qualifications/:uid', authorize('Admin'), auditMiddleware, updateQualification);
router.delete('/qualifications/:uid', authorize('Admin'), deleteQualification);

// --- Cities ---
router.get('/cities', getCities);
router.post('/cities', authorize('Admin'), auditMiddleware, createCity);
router.put('/cities/:id', authorize('Admin'), auditMiddleware, updateCity);
router.delete('/cities/:id', authorize('Admin'), deleteCity);

// --- Plan Mappings ---
router.get('/plan-mappings', getPlanMappings);
router.post('/plan-mappings', authorize('Admin'), auditMiddleware, savePlanMappings);

module.exports = router;
