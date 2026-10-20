const JobEditRequest = require('../models/JobEditRequest');
const Job = require('../models/Job');
const User = require('../models/User');
const Employer = require('../models/Employer');
const JobCategory = require('../models/JobCategory');
const JobType = require('../models/JobType');
const Qualification = require('../models/Qualification');

/**
 * GET /api/admin/job-requests
 * Query: status ('all'|'pending'|'viewed'|'approved'|'rejected'), search, page, limit
 */
exports.getJobRequests = async (req, res) => {
  try {
    const { status = 'all', search = '', page = 1, limit = 20 } = req.query;
    const query = {};

    if (status && status !== 'all') {
      if (status === 'pending_or_viewed') {
        query.status = { $in: ['pending', 'viewed'] };
      } else {
        query.status = status;
      }
    }

    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      query.$or = [
        { jobTitle: regex },
        { companyName: regex }
      ];
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const [total, requests, counts] = await Promise.all([
      JobEditRequest.countDocuments(query),
      JobEditRequest.find(query)
        .populate('job', 'jobTitle status publishStatus vacancies jobLocations city state createDate jobExpiry')
        .populate('employer', 'firstName lastName email phone companyName')
        .populate('employerProfile', 'companyName phone email currentPlan planValidity')
        .populate('reviewedBy', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      JobEditRequest.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        }
      ])
    ]);

    const stats = {
      all: 0,
      pending: 0,
      viewed: 0,
      approved: 0,
      rejected: 0
    };
    counts.forEach(c => {
      if (stats[c._id] !== undefined) {
        stats[c._id] = c.count;
      }
      stats.all += c.count;
    });

    res.json({
      success: true,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      stats,
      requests
    });
  } catch (error) {
    console.error('Error fetching job requests:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch job requests' });
  }
};

/**
 * GET /api/admin/job-requests/:id
 * Fetches request by ID and marks it as viewed (changing status in employer portal immediately)
 */
exports.getJobRequestById = async (req, res) => {
  try {
    const request = await JobEditRequest.findById(req.params.id)
      .populate('job')
      .populate('employer', 'firstName lastName email phone companyName')
      .populate('employerProfile', 'companyName phone email currentPlan planValidity')
      .populate('reviewedBy', 'firstName lastName email');

    if (!request) {
      return res.status(404).json({ message: 'Job request not found' });
    }

    // Auto-mark as viewed if it was pending
    if (request.status === 'pending') {
      request.status = 'viewed';
      request.isViewed = true;
      request.viewedAt = new Date();
      await request.save();

      // Also update Job status
      if (request.job) {
        await Job.findByIdAndUpdate(request.job._id || request.job, {
          status: 'viewed',
          editRequestStatus: 'viewed'
        });
      }
    }

    res.json({
      success: true,
      request
    });
  } catch (error) {
    console.error('Error fetching job request details:', error);
    res.status(500).json({ message: error.message || 'Failed to fetch job request details' });
  }
};

/**
 * POST /api/admin/job-requests/:id/approve
 * Approves the job edit request and publishes the updated job immediately
 */
exports.approveJobRequest = async (req, res) => {
  try {
    const request = await JobEditRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Job request not found' });
    }

    if (request.status === 'approved') {
      return res.status(400).json({ message: 'This request is already approved.' });
    }

    const proposed = request.proposedData || {};
    const job = await Job.findById(request.job);
    if (!job) {
      return res.status(404).json({ message: 'Associated job was not found.' });
    }

    // Apply proposed updates to the Job
    const allowedFields = [
      'jobTitle', 'jobCategory', 'jobType', 'vacancies', 'workMode',
      'jobLocations', 'description', 'jobSummary', 'detailedDescription',
      'responsibilities', 'qualification', 'experience', 'requiredExperience',
      'salary', 'minSalary', 'maxSalary', 'salaryUnit', 'salaryNegotiable',
      'noticePeriod', 'joiningDate', 'shiftTiming', 'jobExpiry', 'benefits',
      'aboutCompany', 'skills', 'languages', 'candidateLocationPreference',
      'screeningQuestions', 'country', 'state', 'district', 'city',
      'companyName', 'contactPerson', 'email', 'phone'
    ];

    allowedFields.forEach((field) => {
      if (proposed[field] !== undefined) {
        job[field] = proposed[field];
      }
    });

    job.status = 'active';
    job.publishStatus = 'publish';
    job.hasPendingEdit = false;
    job.editRequestStatus = 'approved';
    job.editRejectionReason = '';
    job.statusUpdatedBy = req.user._id;
    job.statusUpdatedAt = new Date();
    await job.save();

    // Update the request
    request.status = 'approved';
    request.rejectionReason = '';
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    res.json({
      success: true,
      message: 'Job edit approved and published successfully!',
      request,
      job
    });
  } catch (error) {
    console.error('Error approving job request:', error);
    res.status(500).json({ message: error.message || 'Failed to approve job request' });
  }
};

/**
 * POST /api/admin/job-requests/:id/reject
 * Rejects the job edit request with a mandatory reason
 */
exports.rejectJobRequest = async (req, res) => {
  try {
    const { reason } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ message: 'Rejection reason is required.' });
    }

    const request = await JobEditRequest.findById(req.params.id);
    if (!request) {
      return res.status(404).json({ message: 'Job request not found' });
    }

    const cleanReason = String(reason).trim();

    // Update request
    request.status = 'rejected';
    request.rejectionReason = cleanReason;
    request.reviewedBy = req.user._id;
    request.reviewedAt = new Date();
    await request.save();

    // Update Job
    const job = await Job.findById(request.job);
    if (job) {
      job.status = 'rejected';
      job.publishStatus = 'draft';
      job.hasPendingEdit = false;
      job.editRequestStatus = 'rejected';
      job.editRejectionReason = cleanReason;
      await job.save();
    }

    res.json({
      success: true,
      message: 'Job edit request rejected successfully.',
      request
    });
  } catch (error) {
    console.error('Error rejecting job request:', error);
    res.status(500).json({ message: error.message || 'Failed to reject job request' });
  }
};
