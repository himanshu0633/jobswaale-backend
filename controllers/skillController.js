const Skill = require('../models/Skill');
const Jobseeker = require('../models/Jobseeker');
const Job = require('../models/Job');

/**
 * Standard baseline skills to guarantee a rich initial catalog
 * if database is completely fresh.
 */
const DEFAULT_BASELINE_SKILLS = [
  'Java', 'JavaScript', 'TypeScript', 'Java Spring', 'Spring Boot', 'Python',
  'React.js', 'Node.js', 'Express.js', 'Next.js', 'Angular', 'Vue.js',
  'HTML', 'CSS', 'Tailwind CSS', 'Bootstrap', 'Sass',
  'C', 'C++', 'C#', '.NET', 'ASP.NET', 'PHP', 'Laravel', 'Django', 'Flask',
  'SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Redis', 'Oracle Database',
  'AWS', 'Azure', 'Google Cloud Platform', 'Docker', 'Kubernetes',
  'Git', 'GitHub', 'CI/CD', 'Linux', 'DevOps', 'Jira',
  'UI/UX Design', 'Figma', 'Adobe XD', 'Graphic Design',
  'Data Analysis', 'Machine Learning', 'Artificial Intelligence', 'Pandas',
  'SEO', 'Digital Marketing', 'Content Writing', 'Sales', 'Customer Support'
];

/**
 * Helper to preserve acronyms/known technical casings
 * or convert all-caps/all-lower to proper title casing.
 */
const formatSkillName = (raw) => {
  const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
  if (!trimmed) return '';

  // Well known casings
  const knownCasings = {
    'javascript': 'JavaScript',
    'typescript': 'TypeScript',
    'react': 'React.js',
    'react.js': 'React.js',
    'reactjs': 'React.js',
    'nodejs': 'Node.js',
    'node.js': 'Node.js',
    'nextjs': 'Next.js',
    'next.js': 'Next.js',
    'vue': 'Vue.js',
    'vue.js': 'Vue.js',
    'vuejs': 'Vue.js',
    'express': 'Express.js',
    'express.js': 'Express.js',
    'html': 'HTML',
    'css': 'CSS',
    'sql': 'SQL',
    'mysql': 'MySQL',
    'postgresql': 'PostgreSQL',
    'mongodb': 'MongoDB',
    'aws': 'AWS',
    'gcp': 'GCP',
    'ui/ux': 'UI/UX Design',
    'ui/ux design': 'UI/UX Design',
    'ci/cd': 'CI/CD',
    '.net': '.NET',
    'c++': 'C++',
    'c#': 'C#',
    'php': 'PHP',
    'seo': 'SEO'
  };

  const lower = trimmed.toLowerCase();
  if (knownCasings[lower]) {
    return knownCasings[lower];
  }

  // If user entered all-uppercase (e.g. "JAVA" or "LARAVEL")
  if (trimmed.length > 2 && trimmed === trimmed.toUpperCase()) {
    return trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
  }

  // If user entered all-lowercase (e.g. "java" or "laravel")
  if (trimmed === trimmed.toLowerCase()) {
    return trimmed.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Preserve user-specified casing (e.g., "Java Spring", "Tailwind CSS")
  return trimmed;
};

/**
 * Persists one or more skill names to central database.
 * Thread-safe, avoids duplicates, case-insensitive via normalizedName.
 */
const syncSkillsToDatabase = async (skillList, userId = null) => {
  if (!Array.isArray(skillList) || !skillList.length) return [];

  const results = [];
  for (const raw of skillList) {
    const trimmed = String(raw || '').trim().replace(/\s+/g, ' ');
    // Filter out empty or purely numeric skills
    if (!trimmed || trimmed.length < 2 || /^\d+$/.test(trimmed)) continue;

    const normalizedName = trimmed.toLowerCase();
    const displayName = formatSkillName(trimmed);

    try {
      const skillDoc = await Skill.findOneAndUpdate(
        { normalizedName },
        {
          $setOnInsert: {
            name: displayName,
            normalizedName,
            status: 'active',
            createdBy: userId || null
          },
          $inc: { usageCount: 1 }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      if (skillDoc) results.push(skillDoc);
    } catch (err) {
      // In case of any concurrent collision on unique index
      const existing = await Skill.findOne({ normalizedName });
      if (existing) results.push(existing);
    }
  }
  return results;
};

/**
 * Ensures initial skills are seeded from existing Jobseekers/Jobs
 * or baseline catalog if Skill collection is empty.
 */
let hasCheckedInitialSeed = false;
const ensureInitialSkillsSeeded = async () => {
  if (hasCheckedInitialSeed) return;
  hasCheckedInitialSeed = true;

  try {
    const count = await Skill.countDocuments();
    if (count > 0) return;

    // Pull any existing skills from jobseekers & jobs
    const [seekerSkills, jobSkills] = await Promise.all([
      Jobseeker.distinct('skills').catch(() => []),
      Job.distinct('skills').catch(() => [])
    ]);

    const combinedSet = new Set([
      ...DEFAULT_BASELINE_SKILLS,
      ...(seekerSkills || []),
      ...(jobSkills || [])
    ]);

    const list = Array.from(combinedSet);
    for (const item of list) {
      if (item && typeof item === 'string' && item.trim().length >= 2 && !/^\d+$/.test(item.trim())) {
        const norm = item.trim().toLowerCase();
        await Skill.updateOne(
          { normalizedName: norm },
          {
            $setOnInsert: {
              name: formatSkillName(item),
              normalizedName: norm,
              status: 'active',
              usageCount: 1
            }
          },
          { upsert: true }
        ).catch(() => {});
      }
    }
  } catch (err) {
    console.warn('Initial skill seeding note:', err.message);
  }
};

/**
 * GET /api/skills
 * Supports search term `q` and optional `limit`.
 * Returns matching skills from central database.
 */
exports.getSkills = async (req, res) => {
  try {
    await ensureInitialSkillsSeeded();

    const { q, limit = 50, format } = req.query;
    const limitNum = Math.min(Math.max(parseInt(limit) || 50, 1), 200);

    let query = { status: 'active' };
    const rawQ = String(q || '').trim();

    if (rawQ) {
      const qNorm = rawQ.toLowerCase();
      const escaped = qNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.normalizedName = { $regex: escaped, $options: 'i' };

      const docs = await Skill.find(query)
        .sort({ usageCount: -1, name: 1 })
        .limit(limitNum)
        .lean();

      // Prioritize skills that start with the query, followed by substring matches
      docs.sort((a, b) => {
        const aStarts = a.normalizedName.startsWith(qNorm);
        const bStarts = b.normalizedName.startsWith(qNorm);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return (b.usageCount || 0) - (a.usageCount || 0) || a.name.localeCompare(b.name);
      });

      if (format === 'names') {
        return res.json(docs.map(s => s.name));
      }

      return res.json(docs.map(s => ({
        _id: s._id,
        name: s.name,
        normalizedName: s.normalizedName,
        usageCount: s.usageCount
      })));
    }

    // Default: Top active skills by popularity
    const docs = await Skill.find(query)
      .sort({ usageCount: -1, name: 1 })
      .limit(limitNum)
      .lean();

    if (format === 'names') {
      return res.json(docs.map(s => s.name));
    }

    return res.json(docs.map(s => ({
      _id: s._id,
      name: s.name,
      normalizedName: s.normalizedName,
      usageCount: s.usageCount
    })));
  } catch (error) {
    console.error('Error fetching skills:', error);
    res.status(500).json({ message: 'Unable to retrieve skills. Please try again.' });
  }
};

/**
 * POST /api/skills
 * Adds one or more skills. Reuses existing if found (case-insensitive).
 */
exports.createSkill = async (req, res) => {
  try {
    const { name, names } = req.body;
    const toProcess = Array.isArray(names) ? names : [name].filter(Boolean);

    if (!toProcess.length) {
      return res.status(400).json({ message: 'Please provide at least one valid skill name.' });
    }

    const saved = await syncSkillsToDatabase(toProcess, req.user?._id || null);

    if (!saved.length) {
      return res.status(400).json({ message: 'Skill name must contain valid letters or technology terms.' });
    }

    return res.status(201).json({
      success: true,
      count: saved.length,
      skill: saved[0],
      skills: saved
    });
  } catch (error) {
    console.error('Error creating skill:', error);
    res.status(500).json({ message: 'Failed to save skill. Please try again.' });
  }
};

exports.syncSkillsToDatabase = syncSkillsToDatabase;
exports.formatSkillName = formatSkillName;
