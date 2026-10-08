/**
 * Comprehensive Email Format Validation & Domain Typo Detection (Backend)
 * 
 * Validates RFC-compliant email syntax and intelligently detects common typos
 * for popular providers (Gmail, Yahoo, Outlook, Hotmail, iCloud, etc.) as well as
 * common TLD typos (.con -> .com), while strictly allowing any valid custom or
 * corporate domains without restricting users to a fixed domain list.
 */

// Popular canonical domains
const CANONICAL_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'yahoo.co.in',
  'yahoo.in',
  'ymail.com',
  'outlook.com',
  'outlook.in',
  'hotmail.com',
  'hotmail.co.in',
  'live.com',
  'live.in',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'rediffmail.com',
  'zoho.com',
  'zohomail.com',
  'protonmail.com',
  'proton.me',
  'aol.com'
];

// Direct mapping of known domain typos to correct canonical domain
const KNOWN_DOMAIN_TYPOS = {
  // Gmail typos
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmaik.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gmaili.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmeil.com': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'g-mail.com': 'gmail.com',
  'g.mail.com': 'gmail.com',
  'gmaol.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmai.co': 'gmail.com',
  'gmial.co': 'gmail.com',
  'gamil.co': 'gmail.com',
  'gmaill.co': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmai.con': 'gmail.com',
  'gmial.con': 'gmail.com',
  'gamil.con': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmai.cm': 'gmail.com',
  'gmail.cmo': 'gmail.com',
  'gmai.cmo': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.col': 'gmail.com',
  'gmail.vom': 'gmail.com',
  'gmail.xom': 'gmail.com',
  'gmail.ocm': 'gmail.com',
  'gmail.comn': 'gmail.com',
  'gmail.in': 'gmail.com',
  'gmai.in': 'gmail.com',
  'gmial.in': 'gmail.com',
  'gamil.in': 'gmail.com',
  'googlemial.com': 'googlemail.com',
  'googlemail.co': 'googlemail.com',
  'googlemail.con': 'googlemail.com',

  // Yahoo typos
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhaoo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yahou.com': 'yahoo.com',
  'yahool.com': 'yahoo.com',
  'yaaho.com': 'yahoo.com',
  'yaho.co': 'yahoo.com',
  'yahoo.co': 'yahoo.com',
  'yhaoo.co': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
  'yaho.con': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.cmo': 'yahoo.com',
  'yahoo.comm': 'yahoo.com',
  'yaho.co.in': 'yahoo.co.in',
  'yhaoo.co.in': 'yahoo.co.in',
  'yahooo.co.in': 'yahoo.co.in',
  'yaho.in': 'yahoo.in',

  // Outlook typos
  'outlok.com': 'outlook.com',
  'outluk.com': 'outlook.com',
  'outlock.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'otlook.com': 'outlook.com',
  'outllok.com': 'outlook.com',
  'outloook.com': 'outlook.com',
  'outlook.co': 'outlook.com',
  'outlok.co': 'outlook.com',
  'outlook.con': 'outlook.com',
  'outlook.cm': 'outlook.com',
  'outlook.cmo': 'outlook.com',
  'outlook.comm': 'outlook.com',

  // Hotmail typos
  'hotmial.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmaill.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmaik.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmeil.com': 'hotmail.com',
  'hotmali.com': 'hotmail.com',
  'hotmail.co': 'hotmail.com',
  'hotmai.co': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'hotmai.con': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'hotmail.cmo': 'hotmail.com',
  'hotmail.comm': 'hotmail.com',

  // Live / MSN
  'liv.com': 'live.com',
  'live.co': 'live.com',
  'live.con': 'live.com',

  // iCloud typos
  'icld.com': 'icloud.com',
  'iclod.com': 'icloud.com',
  'iclaud.com': 'icloud.com',
  'icloud.co': 'icloud.com',
  'icloud.con': 'icloud.com',
  'icloud.cm': 'icloud.com',

  // Rediffmail typos
  'redifmail.com': 'rediffmail.com',
  'rediffmai.com': 'rediffmail.com',
  'rediffmial.com': 'rediffmail.com',
  'redif.com': 'rediffmail.com',
  'rediffmail.co': 'rediffmail.com',
  'rediffmail.con': 'rediffmail.com',

  // Zoho typos
  'zohoo.com': 'zoho.com',
  'zohomail.co': 'zoho.com',
  'zoho.co': 'zoho.com',
  'zoho.con': 'zoho.com',

  // ProtonMail typos
  'protonmial.com': 'protonmail.com',
  'protonmai.com': 'protonmail.com',
  'protonmail.co': 'protonmail.com',
  'protonmail.con': 'protonmail.com'
};

// Common TLD typos across ANY custom domain
const TLD_TYPOS = {
  'con': 'com',
  'cmo': 'com',
  'comm': 'com',
  'coom': 'com',
  'ocm': 'com',
  'col': 'com',
  'vom': 'com',
  'xom': 'com',
  'co.i': 'co.in',
  'co.im': 'co.in',
  'co.n': 'co.in'
};

/**
 * Compute Levenshtein distance between two strings
 */
function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Validates email format and detects domain typos.
 * 
 * @param {string} email
 * @param {object} [options]
 * @returns {object} { valid, error, hasTypo, suggestion, suggestedDomain, reason, normalized }
 */
function validateEmail(email, options = {}) {
  const raw = String(email || '').trim();
  const normalized = raw.toLowerCase();

  if (!raw) {
    return {
      valid: false,
      error: 'Email address is required.',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized: ''
    };
  }

  const atIndex = normalized.indexOf('@');
  const lastAtIndex = normalized.lastIndexOf('@');

  if (atIndex === -1 || atIndex !== lastAtIndex) {
    return {
      valid: false,
      error: 'Please enter a valid email address with a single @ symbol.',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  const localPart = normalized.slice(0, atIndex);
  const domainPart = normalized.slice(atIndex + 1);

  if (!localPart || localPart.length > 64) {
    return {
      valid: false,
      error: 'The username part of your email address is invalid.',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  if (!domainPart || domainPart.length > 255) {
    return {
      valid: false,
      error: 'The domain part of your email address is invalid.',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return {
      valid: false,
      error: 'The email address cannot start/end with a dot or contain consecutive dots.',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  if (domainPart.startsWith('.') || domainPart.endsWith('.') || domainPart.startsWith('-') || domainPart.endsWith('-') || domainPart.includes('..')) {
    return {
      valid: false,
      error: 'Invalid domain format in email address.',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  const domainParts = domainPart.split('.');
  if (domainParts.length < 2) {
    return {
      valid: false,
      error: 'Email domain must include a valid extension (e.g., .com, .org, .in).',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  const tld = domainParts[domainParts.length - 1];
  if (!/^[a-z]{2,24}$/.test(tld)) {
    return {
      valid: false,
      error: `Invalid domain extension ".${tld}" in email address.`,
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(normalized)) {
    return {
      valid: false,
      error: 'Please enter a valid email address (e.g., user@example.com).',
      hasTypo: false,
      suggestion: null,
      suggestedDomain: null,
      reason: null,
      normalized
    };
  }

  // 1. Known Typos Direct Map
  if (KNOWN_DOMAIN_TYPOS[domainPart]) {
    const suggestedDomain = KNOWN_DOMAIN_TYPOS[domainPart];
    const suggestion = `${localPart}@${suggestedDomain}`;
    return {
      valid: false,
      error: `Invalid email domain: Did you mean @${suggestedDomain}?`,
      hasTypo: true,
      suggestion,
      suggestedDomain,
      reason: `Typo detected in domain "${domainPart}". Suggested: "${suggestedDomain}".`,
      normalized
    };
  }

  // 2. Generic TLD Typos
  const lastDotIndex = domainPart.lastIndexOf('.');
  if (lastDotIndex > 0) {
    const currentTld = domainPart.slice(lastDotIndex + 1);
    const domainPrefix = domainPart.slice(0, lastDotIndex);

    if (TLD_TYPOS[currentTld]) {
      const fixedTld = TLD_TYPOS[currentTld];
      const suggestedDomain = `${domainPrefix}.${fixedTld}`;
      const suggestion = `${localPart}@${suggestedDomain}`;
      return {
        valid: false,
        error: `Invalid extension ".${currentTld}": Did you mean @${suggestedDomain}?`,
        hasTypo: true,
        suggestion,
        suggestedDomain,
        reason: `Typo in domain extension ".${currentTld}". Suggested: ".${fixedTld}".`,
        normalized
      };
    }
  }

  // 3. Fuzzy Levenshtein Distance Check
  if (!CANONICAL_DOMAINS.includes(domainPart)) {
    for (const canonical of CANONICAL_DOMAINS) {
      const dist = levenshteinDistance(domainPart, canonical);
      if (dist === 1 || (dist === 2 && domainPart[0] === canonical[0] && Math.abs(domainPart.length - canonical.length) <= 1)) {
        if (domainPart === 'mail.com') {
          continue;
        }

        const suggestion = `${localPart}@${canonical}`;
        return {
          valid: false,
          error: `Did you mean @${canonical}?`,
          hasTypo: true,
          suggestion,
          suggestedDomain: canonical,
          reason: `Typo detected in domain "${domainPart}". Suggested: "${canonical}".`,
          normalized
        };
      }
    }
  }

  return {
    valid: true,
    error: null,
    hasTypo: false,
    suggestion: null,
    suggestedDomain: null,
    reason: null,
    normalized
  };
}

module.exports = {
  validateEmail,
  CANONICAL_DOMAINS,
  KNOWN_DOMAIN_TYPOS
};
