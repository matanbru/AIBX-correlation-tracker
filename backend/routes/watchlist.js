import express from 'express';

const router = express.Router();

// Get user's watchlist
router.get('/:userId', (req, res) => {
  try {
    let watchlist = req.db.watchlists.find(w => w.userId === req.params.userId);
    
    if (!watchlist) {
      watchlist = {
        userId: req.params.userId,
        companies: [],
        notifications: {
          enabled: true,
          priceThreshold: 5,
          emailNotifications: false
        }
      };
      req.db.watchlists.push(watchlist);
    }

    res.json(watchlist);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add company to watchlist
router.post('/:userId/add', (req, res) => {
  try {
    const { companyId, symbol } = req.body;

    const company = req.db.companies.find(c => c._id === companyId || c.symbol === symbol);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    let watchlist = req.db.watchlists.find(w => w.userId === req.params.userId);
    
    if (!watchlist) {
      watchlist = {
        userId: req.params.userId,
        companies: [],
        notifications: {
          enabled: true,
          priceThreshold: 5,
          emailNotifications: false
        }
      };
      req.db.watchlists.push(watchlist);
    }

    // Check if already in watchlist
    const exists = watchlist.companies.some(c => c.symbol === company.symbol);
    if (exists) {
      return res.status(400).json({ error: 'Company already in watchlist' });
    }

    watchlist.companies.push({
      companyId: company._id,
      symbol: company.symbol,
      addedAt: new Date()
    });

    res.json(watchlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Remove company from watchlist
router.post('/:userId/remove', (req, res) => {
  try {
    const { companyId } = req.body;

    const watchlist = req.db.watchlists.find(w => w.userId === req.params.userId);
    if (!watchlist) return res.status(404).json({ error: 'Watchlist not found' });

    watchlist.companies = watchlist.companies.filter(c => c.companyId !== companyId);

    res.json(watchlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update notification settings
router.put('/:userId/notifications', (req, res) => {
  try {
    let watchlist = req.db.watchlists.find(w => w.userId === req.params.userId);
    
    if (!watchlist) {
      watchlist = {
        userId: req.params.userId,
        companies: [],
        notifications: req.body
      };
      req.db.watchlists.push(watchlist);
    } else {
      watchlist.notifications = { ...watchlist.notifications, ...req.body };
    }

    res.json(watchlist);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
