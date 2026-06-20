const permissionGroups = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'View Dashboard' },
      { key: 'dashboard.export', label: 'Export Reports' }
    ]
  },
  {
    key: 'people',
    label: 'People',
    permissions: [
      { key: 'people.jobs.view', label: 'View Jobs' },
      { key: 'people.jobs.create', label: 'Create Jobs' },
      { key: 'people.jobs.edit', label: 'Edit Jobs' },
      { key: 'people.jobs.delete', label: 'Delete Jobs' },
      { key: 'people.jobseekers.view', label: 'View Jobseekers' },
      { key: 'people.jobseekers.manage', label: 'Manage Jobseekers' },
      { key: 'people.employers.view', label: 'View Employers' },
      { key: 'people.employers.manage', label: 'Manage Employers' }
    ]
  },
  {
    key: 'masters',
    label: 'Masters',
    permissions: [
      { key: 'masters.plans', label: 'Plans Management' },
      { key: 'masters.industry', label: 'Industry Types' },
      { key: 'masters.categories', label: 'Job Categories' },
      { key: 'masters.jobtypes', label: 'Job Types' },
      { key: 'masters.qualifications', label: 'Qualifications' },
      { key: 'masters.locations', label: 'Locations' }
    ]
  },
  {
    key: 'finance',
    label: 'Finance',
    permissions: [
      { key: 'finance.payments.view', label: 'View Payments' },
      { key: 'finance.payments.manage', label: 'Manage Payments' },
      { key: 'finance.transactions.view', label: 'View Transactions' },
      { key: 'finance.reports', label: 'Finance Reports' }
    ]
  },
  {
    key: 'content',
    label: 'Content',
    permissions: [
      { key: 'content.cms', label: 'CMS Pages' },
      { key: 'content.blog', label: 'Blog Management' }
    ]
  },
  {
    key: 'system',
    label: 'System',
    permissions: [
      { key: 'system.reports', label: 'View Reports' },
      { key: 'system.settings', label: 'Manage Settings' },
      { key: 'system.users', label: 'Manage Users' },
      { key: 'system.roles', label: 'Manage Roles' }
    ]
  }
];

const allPermissions = permissionGroups.flatMap(group => group.permissions.map(permission => permission.key));

const presets = {
  admin: allPermissions.filter(key => key !== 'system.settings'),
  editor: [
    'dashboard.view',
    'people.jobs.view',
    'people.jobs.create',
    'people.jobs.edit',
    'people.jobseekers.view',
    'content.cms',
    'content.blog'
  ],
  support: [
    'dashboard.view',
    'people.jobs.view',
    'people.jobseekers.view',
    'people.employers.view'
  ],
  finance: [
    'dashboard.view',
    'finance.payments.view',
    'finance.payments.manage',
    'finance.transactions.view',
    'finance.reports'
  ]
};

module.exports = { permissionGroups, allPermissions, presets };
