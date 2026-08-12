import express from 'express';

const router = express.Router();

const getAllCompanies = (db) => [...(db.companies || []), ...(db.opportunityCompanies || [])];

const findCompanyBySymbol = (db, symbol) => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  return getAllCompanies(db).find(company => company.symbol.toUpperCase() === normalizedSymbol);
};

// Generate random price updates
function generateRandomPrice(basePrice) {
  const change = (Math.random() - 0.5) * 10;
  return {
    price: parseFloat((basePrice + change).toFixed(2)),
    change: parseFloat(change.toFixed(2)),
    timestamp: new Date()
  };
}

// Get current prices for all companies
router.get('/current', (req, res) => {
  try {
    const prices = getAllCompanies(req.db).map(company => {
      const existingPrice = req.db.prices.find(p => p.symbol === company.symbol);
      if (existingPrice) {
        return existingPrice;
      }
      const priceData = {
        symbol: company.symbol,
        price: company.price,
        changePercent: company.change,
        timestamp: new Date()
      };
      return priceData;
    });

    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get price history for a company
router.get('/:symbol/history', (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const days = Math.min(Math.max(parseInt(req.query.days) || 30, 7), 365);
    const company = findCompanyBySymbol(req.db, symbol);

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const prices = [];
    const basePrice = company.price;
    const today = new Date();

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const variance = (Math.random() - 0.5) * (basePrice * 0.12);
      const drift = ((days - i) / days) * (company.change || 0) * 0.8;
      const value = basePrice + variance + drift;

      prices.push({
        symbol,
        price: parseFloat(value.toFixed(2)),
        high: parseFloat((value + 4.5).toFixed(2)),
        low: parseFloat((value - 4.5).toFixed(2)),
        timestamp: date
      });
    }

    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get peer comparison series for same sector or related companies
router.get('/:symbol/peers', (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const company = findCompanyBySymbol(req.db, symbol);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const allCompanies = getAllCompanies(req.db).filter(c => c.symbol !== symbol);
    const sectorPeers = allCompanies.slice(0, 5);

    const peerSeries = sectorPeers.map(peer => {
      const peerBase = peer.price;
      const dayCount = 30;
      const points = [];
      const today = new Date();

      for (let i = dayCount - 1; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const variance = (Math.random() - 0.5) * (peerBase * 0.1);
        const drift = (dayCount - i) / dayCount * (peer.change || 0) * 0.5;
        points.push({
          date,
          price: parseFloat((peerBase + variance + drift).toFixed(2))
        });
      }

      return {
        symbol: peer.symbol,
        name: peer.name,
        series: points
      };
    });

    res.json({
      reference: symbol,
      peers: peerSeries
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get latest price for a company
router.get('/:symbol/latest', (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    const company = findCompanyBySymbol(req.db, symbol);

    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const price = {
      symbol,
      price: company.price,
      changePercent: company.change,
      timestamp: new Date()
    };

    res.json(price);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add/update price (simulate real-time update)
router.post('/', (req, res) => {
  try {
    const { symbol, price, changePercent } = req.body;

    const company = findCompanyBySymbol(req.db, symbol);
    if (!company) return res.status(404).json({ error: 'Company not found' });

    const priceData = {
      symbol,
      price: price || company.price,
      changePercent: changePercent || company.change,
      timestamp: new Date()
    };

    req.db.prices.push(priceData);

    // Emit real-time update via WebSocket
    const io = res.app.locals.io;
    if (io) {
      io.emit('price-update', priceData);
    }

    res.status(201).json(priceData);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get top gainers
router.get('/gainers/top', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const prices = getAllCompanies(req.db)
      .sort((a, b) => b.change - a.change)
      .slice(0, limit)
      .map(c => ({
        symbol: c.symbol,
        price: c.price,
        changePercent: c.change,
        timestamp: new Date()
      }));

    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get top losers
router.get('/losers/top', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const prices = getAllCompanies(req.db)
      .sort((a, b) => a.change - b.change)
      .slice(0, limit)
      .map(c => ({
        symbol: c.symbol,
        price: c.price,
        changePercent: c.change,
        timestamp: new Date()
      }));

    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
