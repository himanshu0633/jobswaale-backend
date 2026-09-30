const SystemSetting = require('../models/SystemSetting');

const defaultSettings = {
  siteName: 'JobsWaale',
  siteUrl: 'https://jobswaale.com',
  siteEmail: 'support@jobswaale.com',
  sitePhone: '+91 8628821441',
  defaultLang: 'en',
  timezone: 'Asia/Kolkata',
  currency: 'INR',
  dateFormat: 'd-m-Y',
  maintenanceMode: false,
  userRegistration: true,
  jobApprovalRequired: true,
  notifNewJob: true,
  notifNewApp: true,
  notifNewEmp: true,
  notifPayment: true,
  notifReport: false,
  minPassLen: 8,
  passExpiry: 90,
  maxLoginAttempts: 5,
  lockoutDuration: 30,
  twoFactor: false,
  captchaEnabled: false,
  sessionTimeout: false,
  mailDriver: 'smtp',
  mailHost: '',
  mailPort: 587,
  mailEncryption: 'tls',
  mailUsername: '',
  mailPassword: '',
  mailFromName: 'JobsWaale',
  mailFromEmail: 'noreply@jobswaale.com',

  // Home Dashboard
  heroTitle: 'Find Your Dream Job & Build Your Future',
  heroSubtitle: 'Connect with thousands of employers and find the right job for your career growth.',
  showHeroSearch: true,
  showTrendingSearches: true,
  showAccountTypeCards: true,
  showStatsBar: true,
  showPopularCategories: true,
  showFeaturedJobs: true,
  showTopCompanies: true,
  showDoubleCTA: true,
  statOpenJobs: '2,000+',
  statCompanies: '500+',
  statJobseekers: '15,000+',
  statCities: '50+',
  maxFeaturedJobs: 6,
  maxPopularCategories: 8
};

const booleanKeys = [
  'maintenanceMode',
  'userRegistration',
  'jobApprovalRequired',
  'notifNewJob',
  'notifNewApp',
  'notifNewEmp',
  'notifPayment',
  'notifReport',
  'twoFactor',
  'captchaEnabled',
  'sessionTimeout',
  'showHeroSearch',
  'showTrendingSearches',
  'showAccountTypeCards',
  'showStatsBar',
  'showPopularCategories',
  'showFeaturedJobs',
  'showTopCompanies',
  'showDoubleCTA'
];

const numberKeys = ['mailPort', 'minPassLen', 'passExpiry', 'maxLoginAttempts', 'lockoutDuration', 'maxFeaturedJobs', 'maxPopularCategories'];

const normalizeSettings = (input = {}) => {
  const merged = { ...defaultSettings, ...(input || {}) };

  booleanKeys.forEach((key) => {
    merged[key] = Boolean(merged[key]);
  });

  numberKeys.forEach((key) => {
    merged[key] = Number(merged[key]) || defaultSettings[key];
  });

  merged.minPassLen = Math.min(Math.max(merged.minPassLen, 6), 20);
  merged.passExpiry = Math.min(Math.max(merged.passExpiry, 0), 365);
  merged.maxLoginAttempts = Math.min(Math.max(merged.maxLoginAttempts, 1), 10);
  merged.lockoutDuration = Math.min(Math.max(merged.lockoutDuration, 1), 1440);
  merged.mailPort = Math.min(Math.max(merged.mailPort, 1), 65535);

  return merged;
};

const getSettings = async () => {
  const doc = await SystemSetting.findOne({ key: 'global' }).lean();
  return normalizeSettings(doc?.settings || {});
};

const saveSettings = async (settings, userId) => {
  const normalized = normalizeSettings(settings);
  const doc = await SystemSetting.findOneAndUpdate(
    { key: 'global' },
    { settings: normalized, updatedBy: userId || null },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  return normalizeSettings(doc.settings);
};

const getPublicSettings = (settings) => {
  const safe = normalizeSettings(settings);
  return {
    siteName: safe.siteName,
    siteUrl: safe.siteUrl,
    siteEmail: safe.siteEmail,
    sitePhone: safe.sitePhone,
    defaultLang: safe.defaultLang,
    timezone: safe.timezone,
    currency: safe.currency,
    dateFormat: safe.dateFormat,
    maintenanceMode: safe.maintenanceMode,
    userRegistration: safe.userRegistration,
    jobApprovalRequired: safe.jobApprovalRequired,
    minPassLen: safe.minPassLen,
    captchaEnabled: safe.captchaEnabled,
    heroTitle: safe.heroTitle,
    heroSubtitle: safe.heroSubtitle,
    showHeroSearch: safe.showHeroSearch,
    showTrendingSearches: safe.showTrendingSearches,
    showAccountTypeCards: safe.showAccountTypeCards,
    showStatsBar: safe.showStatsBar,
    showPopularCategories: safe.showPopularCategories,
    showFeaturedJobs: safe.showFeaturedJobs,
    showTopCompanies: safe.showTopCompanies,
    showDoubleCTA: safe.showDoubleCTA,
    statOpenJobs: safe.statOpenJobs,
    statCompanies: safe.statCompanies,
    statJobseekers: safe.statJobseekers,
    statCities: safe.statCities,
    maxFeaturedJobs: safe.maxFeaturedJobs,
    maxPopularCategories: safe.maxPopularCategories
  };
};

module.exports = {
  defaultSettings,
  getSettings,
  saveSettings,
  getPublicSettings,
  normalizeSettings
};
