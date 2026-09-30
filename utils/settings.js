const SystemSetting = require('../models/SystemSetting');

const defaultSettings = {
  siteName: 'JobsWaale',
  siteUrl: 'https://jobswaale.com',
  siteEmail: 'Jobswaale.india@gmail.com',
  sitePhone: '+91 99998 84424',
  siteAddress: 'Hamirpur, Himachal Pradesh, India',
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
  heroSubtitle: 'Find the jobs faster and easier. We connect job seekers with nearby opportunities and help employers hire quickly.',
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
  maxPopularCategories: 8,
  trustedCompanies: [
    { name: 'Google', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg' },
    { name: 'Airbnb', logo: 'https://upload.wikimedia.org/wikipedia/commons/6/69/Airbnb_Logo_B%C3%A9lo.svg' },
    { name: 'Dropbox', logo: 'https://upload.wikimedia.org/wikipedia/commons/7/78/Dropbox_Icon.svg' },
    { name: 'FedEx', logo: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/FedEx_Express.svg' },
    { name: 'Walmart', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/5b/Walmart_logo_%282025%29.svg' },
    { name: 'HubSpot', logo: 'https://upload.wikimedia.org/wikipedia/commons/3/3f/HubSpot_Logo.svg' }
  ],
  showMeetOurTeam: true,
  showHappyCustomers: true,
  teamMembers: [
    {
      name: 'Elon Musk',
      role: 'Marketing Crew',
      photo: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?auto=format&fit=crop&w=400&q=80'
    },
    {
      name: 'Bernard Arnault',
      role: 'Marketing Crew',
      photo: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=400&q=80'
    },
    {
      name: 'Jeff Bezos',
      role: 'Marketing Crew',
      photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80'
    },
    {
      name: 'Bill Gates',
      role: 'Marketing Crew',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=400&q=80'
    }
  ],
  happyCustomers: [
    {
      name: 'Sarah Harding',
      role: 'Visual Designer',
      photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80',
      rating: 5,
      review: 'We are on the hunt for a designer who is exceptional in both making incredible product interfaces as well as'
    },
    {
      name: 'Sarah Harding',
      role: 'Visual Designer',
      photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=200&q=80',
      rating: 5,
      review: 'We are on the hunt for a designer who is exceptional in both making incredible product interfaces as well as'
    },
    {
      name: 'Sarah Harding',
      role: 'Visual Designer',
      photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=200&q=80',
      rating: 5,
      review: 'We are on the hunt for a designer who is exceptional in both making incredible product interfaces as well as'
    }
  ]
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
  'showDoubleCTA',
  'showMeetOurTeam',
  'showHappyCustomers'
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

  if (Array.isArray(merged.trustedCompanies)) {
    merged.trustedCompanies = merged.trustedCompanies
      .filter((c) => c && (c.name || c.logo || c.logoUrl))
      .map((c) => ({
        name: String(c.name || '').trim(),
        logo: String(c.logo || c.logoUrl || '').trim()
      }));
  } else {
    merged.trustedCompanies = defaultSettings.trustedCompanies;
  }

  if (Array.isArray(merged.teamMembers)) {
    merged.teamMembers = merged.teamMembers
      .filter((m) => m && (m.name || m.photo || m.role))
      .map((m) => ({
        name: String(m.name || '').trim(),
        role: String(m.role || '').trim(),
        photo: String(m.photo || '').trim()
      }));
  } else {
    merged.teamMembers = defaultSettings.teamMembers;
  }

  if (Array.isArray(merged.happyCustomers)) {
    merged.happyCustomers = merged.happyCustomers
      .filter((c) => c && (c.name || c.review || c.photo))
      .map((c) => ({
        name: String(c.name || '').trim(),
        role: String(c.role || '').trim(),
        photo: String(c.photo || '').trim(),
        rating: Math.min(Math.max(Number(c.rating) || 5, 1), 5),
        review: String(c.review || '').trim()
      }));
  } else {
    merged.happyCustomers = defaultSettings.happyCustomers;
  }

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
    maxPopularCategories: safe.maxPopularCategories,
    siteAddress: safe.siteAddress,
    trustedCompanies: safe.trustedCompanies,
    showMeetOurTeam: safe.showMeetOurTeam,
    showHappyCustomers: safe.showHappyCustomers,
    teamMembers: safe.teamMembers,
    happyCustomers: safe.happyCustomers
  };
};

module.exports = {
  defaultSettings,
  getSettings,
  saveSettings,
  getPublicSettings,
  normalizeSettings
};
