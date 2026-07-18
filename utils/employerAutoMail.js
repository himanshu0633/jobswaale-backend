const EmployerAutoMailSetting = require('../models/EmployerAutoMailSetting');
const EmployerAutoMailLog = require('../models/EmployerAutoMailLog');
const Jobseeker = require('../models/Jobseeker');
const Application = require('../models/Application');
const JobCategory = require('../models/JobCategory');
const { sendJobAlertEmail } = require('./mail');

const toNumber = (value, fallback = 0) => {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
};

const getExperienceYears = (value = '') => {
  const text = String(value || '').toLowerCase();
  if (text.includes('fresher')) return 0;
  const numbers = text.match(/\d+/g);
  if (!numbers?.length) return 0;
  return Math.max(...numbers.map(Number));
};

const cleanLocations = (locations) => (
  Array.isArray(locations) ? locations : String(locations || '').split(',')
).map(item => String(item || '').trim()).filter(Boolean);

const ensureEmployerAutoMailSetting = async ({ employer, plan, resetUsage = false }) => {
  if (!employer?._id) return null;
  const planLimit = Math.max(toNumber(plan?.autoMailLimit, 0), 0);
  const existing = await EmployerAutoMailSetting.findOne({ employer: employer._id });
  const next = {
    employer: employer._id,
    userId: employer.userId || employer.login,
    currentPlan: plan?._id || employer.currentPlan || null,
    limit: planLimit
  };

  if (!existing) {
    return EmployerAutoMailSetting.create({
      ...next,
      enabled: planLimit > 0,
      used: 0,
      perJobLimit: Math.min(10, planLimit || 10)
    });
  }

  const planChanged = String(existing.currentPlan || '') !== String(next.currentPlan || '');
  existing.currentPlan = next.currentPlan;
  existing.limit = planLimit;
  if (resetUsage || planChanged) {
    existing.used = 0;
  }
  if (existing.perJobLimit > planLimit && planLimit > 0) existing.perJobLimit = planLimit;
  if (planLimit === 0) existing.enabled = false;
  await existing.save();
  return existing;
};

const getEmployerAutoMailSummary = async ({ employer, plan }) => {
  const setting = await ensureEmployerAutoMailSetting({ employer, plan });
  if (!setting) return null;
  return {
    enabled: setting.enabled,
    limit: setting.limit,
    used: setting.used,
    remaining: Math.max(Number(setting.limit || 0) - Number(setting.used || 0), 0),
    perJobLimit: setting.perJobLimit,
    activeOnly: setting.activeOnly,
    includeCurrentLocation: setting.includeCurrentLocation,
    includePreferredLocation: setting.includePreferredLocation,
    includeAppliedLocation: setting.includeAppliedLocation,
    locations: setting.locations || [],
    minExperience: setting.minExperience,
    maxExperience: setting.maxExperience,
    lastSentAt: setting.lastSentAt
  };
};

const updateEmployerAutoMailSetting = async ({ employer, plan, payload = {} }) => {
  const setting = await ensureEmployerAutoMailSetting({ employer, plan });
  if (!setting) return null;
  const limit = Number(setting.limit || 0);
  setting.enabled = Boolean(payload.enabled) && limit > 0;
  setting.perJobLimit = Math.max(Math.min(toNumber(payload.perJobLimit, setting.perJobLimit), limit || 0), 0);
  setting.activeOnly = payload.activeOnly !== false;
  setting.includeCurrentLocation = payload.includeCurrentLocation !== false;
  setting.includePreferredLocation = payload.includePreferredLocation !== false;
  setting.includeAppliedLocation = Boolean(payload.includeAppliedLocation);
  setting.locations = cleanLocations(payload.locations);
  setting.minExperience = payload.minExperience === '' || payload.minExperience === null ? null : toNumber(payload.minExperience, null);
  setting.maxExperience = payload.maxExperience === '' || payload.maxExperience === null ? null : toNumber(payload.maxExperience, null);
  await setting.save();
  return getEmployerAutoMailSummary({ employer, plan });
};

const candidateMatchesLocation = async ({ candidate, job, setting }) => {
  const selectedLocations = cleanLocations(setting.locations);
  const jobLocations = cleanLocations(job.jobLocations?.length ? job.jobLocations : [job.city, job.state]);
  const locationPool = selectedLocations.length ? selectedLocations : jobLocations;
  if (!locationPool.length) return true;
  const normalizedPool = locationPool.map(item => item.toLowerCase());
  const candidateLocations = [];
  if (setting.includeCurrentLocation) candidateLocations.push(candidate.city, candidate.state, candidate.district);
  if (setting.includePreferredLocation) candidateLocations.push(candidate.preferredLocation);
  if (candidateLocations.some(value => normalizedPool.some(loc => String(value || '').toLowerCase().includes(loc)))) {
    return true;
  }

  if (!setting.includeAppliedLocation) return false;
  const appliedJobs = await Application.find({ candidate: candidate._id })
    .populate('job', 'city state district jobLocations')
    .lean();
  return appliedJobs.some(app => {
    const appliedLocationText = cleanLocations(app.job?.jobLocations?.length ? app.job.jobLocations : [app.job?.city, app.job?.state, app.job?.district]).join(' ').toLowerCase();
    return normalizedPool.some(loc => appliedLocationText.includes(loc));
  });
};

const sendEmployerJobAutoMails = async ({ employer, plan, job }) => {
  const setting = await ensureEmployerAutoMailSetting({ employer, plan });
  const remaining = Math.max(Number(setting?.limit || 0) - Number(setting?.used || 0), 0);
  if (!setting?.enabled || remaining <= 0 || job.publishStatus === 'draft' || job.status !== 'active') {
    return { attempted: 0, sent: 0, skipped: 0, failed: 0 };
  }

  const sendCap = Math.min(Number(setting.perJobLimit || 0), remaining);
  if (sendCap <= 0) return { attempted: 0, sent: 0, skipped: 0, failed: 0 };

  const candidates = await Jobseeker.find({
    isDeleted: { $ne: true },
    status: 'active',
    jobSearchStatus: setting.activeOnly ? { $in: ['looking', null] } : { $in: ['looking', 'not-looking', null] },
    jobCategory: job.jobCategory
  }).populate('userId', 'email').lean();

  const category = await JobCategory.findById(job.jobCategory).select('categoryName').lean();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const candidate of candidates) {
    if (sent >= sendCap) break;
    const email = candidate.userId?.email;
    const exp = getExperienceYears(candidate.experience);
    if (!email) {
      skipped += 1;
      continue;
    }
    if (setting.minExperience !== null && exp < Number(setting.minExperience)) continue;
    if (setting.maxExperience !== null && exp > Number(setting.maxExperience)) continue;
    const locationOk = await candidateMatchesLocation({ candidate, job, setting });
    if (!locationOk) continue;

    const existing = await EmployerAutoMailLog.findOne({ employer: employer._id, job: job._id, jobseeker: candidate._id }).lean();
    if (existing) continue;

    const result = await sendJobAlertEmail({
      to: email,
      seekerName: candidate.name,
      job,
      employer,
      categoryName: category?.categoryName
    });
    await EmployerAutoMailLog.create({
      employer: employer._id,
      job: job._id,
      jobseeker: candidate._id,
      email,
      status: result.sent ? 'sent' : 'failed',
      reason: result.reason || ''
    }).catch(() => null);

    if (result.sent) sent += 1;
    else failed += 1;
  }

  if (sent > 0) {
    await EmployerAutoMailSetting.findByIdAndUpdate(setting._id, {
      $inc: { used: sent },
      lastSentAt: new Date()
    });
  }

  return { attempted: sent + failed, sent, skipped, failed };
};

module.exports = {
  ensureEmployerAutoMailSetting,
  getEmployerAutoMailSummary,
  updateEmployerAutoMailSetting,
  sendEmployerJobAutoMails
};
