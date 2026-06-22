const Transaction = require('../models/Transaction');
const { addAuditOnCreate } = require('../utils/auditHelper');

// Helper to seed transactions if the collection is empty
const seedTransactionsIfEmpty = async (userId) => {
  const count = await Transaction.countDocuments({ isDeleted: { $ne: true } });
  if (count > 0) return;

  const mockData = [
    {
      txnId: 'TXN-001',
      txnDate: new Date('2026-06-10T11:15:00'),
      type: 'Credit',
      category: 'Manual Entry',
      paymentRef: 'PAY-001',
      userType: 'Employer',
      customerName: 'Lord Shiva Institute',
      amount: 1000,
      description: 'Cash payment for Priority plan',
      status: 'Success',
      login: userId
    },
    {
      txnId: 'TXN-002',
      txnDate: new Date('2026-06-12T09:42:00'),
      type: 'Credit',
      category: 'Plan Purchase',
      paymentRef: 'PAY-002',
      userType: 'Jobseeker',
      customerName: 'Jyoti Sharma',
      amount: 500,
      description: 'Basic plan purchase via UPI',
      status: 'Success',
      login: userId
    },
    {
      txnId: 'TXN-003',
      txnDate: new Date('2026-06-13T16:20:00'),
      type: 'Debit',
      category: 'Refund',
      paymentRef: 'PAY-003',
      userType: 'Jobseeker',
      customerName: 'Aniket Sharma',
      amount: 1000,
      description: 'Refund for failed Priority plan payment',
      status: 'Success',
      login: userId
    },
    {
      txnId: 'TXN-004',
      txnDate: new Date('2026-06-14T14:05:00'),
      type: 'Credit',
      category: 'Plan Purchase',
      paymentRef: 'PAY-004',
      userType: 'Employer',
      customerName: 'Duke Infosys',
      amount: 5000,
      description: 'Premium plan purchase via Net Banking',
      status: 'Success',
      login: userId
    },
    {
      txnId: 'TXN-005',
      txnDate: new Date('2026-06-15T10:30:00'),
      type: 'Debit',
      category: 'Adjustment',
      paymentRef: '—',
      userType: 'Employer',
      customerName: 'Duke Infosys',
      amount: 500,
      description: 'Admin adjustment for duplicate charge',
      status: 'Pending',
      login: userId
    },
    {
      txnId: 'TXN-006',
      txnDate: new Date('2026-06-15T11:45:00'),
      type: 'Credit',
      category: 'Plan Purchase',
      paymentRef: 'PAY-006',
      userType: 'Jobseeker',
      customerName: 'Jyoti Sharma',
      amount: 0,
      description: 'Free plan activation',
      status: 'Success',
      login: userId
    },
    {
      txnId: 'TXN-007',
      txnDate: new Date('2026-06-15T15:10:00'),
      type: 'Credit',
      category: 'Plan Purchase',
      paymentRef: 'PAY-007',
      userType: 'Employer',
      customerName: 'Lord Shiva Institute',
      amount: 5000,
      description: 'Cheque payment for Premium plan (pending clearance)',
      status: 'Pending',
      login: userId
    }
  ];

  await Transaction.insertMany(mockData);
};

exports.getTransactions = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = '',
      type = '',
      category = '',
      userType = '',
      fromDate = '',
      toDate = ''
    } = req.query;

    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    // Seed mock data if collection is empty
    await seedTransactionsIfEmpty(req.user ? req.user._id : null);

    const filter = { isDeleted: { $ne: true } };

    if (type) filter.type = type;
    if (category) filter.category = category;
    if (userType) filter.userType = userType;

    if (search) {
      filter.$or = [
        { txnId: { $regex: search, $options: 'i' } },
        { customerName: { $regex: search, $options: 'i' } },
        { paymentRef: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (fromDate || toDate) {
      filter.txnDate = {};
      if (fromDate) {
        filter.txnDate.$gte = new Date(fromDate);
      }
      if (toDate) {
        const end = new Date(toDate);
        end.setHours(23, 59, 59, 999);
        filter.txnDate.$lte = end;
      }
    }

    // Execute queries
    const [total, docs] = await Promise.all([
      Transaction.countDocuments(filter),
      Transaction.find(filter)
        .sort({ txnDate: -1, createDate: -1 })
        .skip(skip)
        .limit(limitNum)
    ]);

    // Calculate overall statistics for all non-deleted transactions
    const allStats = await Transaction.aggregate([
      { $match: { isDeleted: { $ne: true } } },
      {
        $group: {
          _id: null,
          totalCredits: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'Credit'] }, { $ne: ['$status', 'Failed'] }] },
                '$amount',
                0
              ]
            }
          },
          totalDebits: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$type', 'Debit'] }, { $ne: ['$status', 'Failed'] }] },
                '$amount',
                0
              ]
            }
          }
        }
      }
    ]);

    const stats = allStats[0] || { totalCredits: 0, totalDebits: 0 };
    const netBalance = stats.totalCredits - stats.totalDebits;

    // Today's Activity Count
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const todaysActivity = await Transaction.countDocuments({
      isDeleted: { $ne: true },
      txnDate: { $gte: startOfToday, $lte: endOfToday }
    });

    res.json({
      docs,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      stats: {
        totalCredits: stats.totalCredits,
        totalDebits: stats.totalDebits,
        netBalance,
        todaysActivity
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
