import express from 'express';

const router = express.Router();

const getAllCompanies = (db) => [...(db.companies || []), ...(db.opportunityCompanies || [])];

const findCompanyBySymbol = (db, symbol) => {
  const normalizedSymbol = String(symbol || '').toUpperCase();
  return getAllCompanies(db).find(company => company.symbol.toUpperCase() === normalizedSymbol);
};

const observationTimestamp = (company) => company.priceHistory?.at(-1)?.timestamp || null;

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
        timestamp: observationTimestamp(company),
        dataStatus: company.marketData?.dataStatus || 'unavailable',
        lastUpdate: company.marketData?.lastUpdate || null
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

    const prices = (company.priceHistory || []).slice(-days).map(point => ({
      symbol,
      price: point.adjustedClose,
      timestamp: point.timestamp,
      date: point.date,
      volume: point.volume
    }));

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
      return {
        symbol: peer.symbol,
        name: peer.name,
        series: (peer.priceHistory || []).slice(-30).map(point => ({
          date: point.date,
          price: point.adjustedClose
        }))
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
      timestamp: company.priceHistory?.at(-1)?.timestamp || null,
      dataStatus: company.marketData?.dataStatus || 'unavailable',
      lastUpdate: company.marketData?.lastUpdate || null
    };

    res.json(price);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Manual price writes are disabled; Twelve Data owns market prices.
router.post('/', (req, res) => {
  res.status(409).json({ error: 'Manual price updates are disabled. Prices are loaded from Twelve Data.' });
});

// Get top gainers
router.get('/gainers/top', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;

    const prices = getAllCompanies(req.db)
      .filter(company => Number.isFinite(company.change) && Number.isFinite(company.price))
      .sort((a, b) => b.change - a.change)
      .slice(0, limit)
      .map(c => ({
        symbol: c.symbol,
        price: c.price,
        changePercent: c.change,
        timestamp: observationTimestamp(c),
        dataStatus: c.marketData?.dataStatus || 'unavailable',
        lastUpdate: c.marketData?.lastUpdate || null
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
      .filter(company => Number.isFinite(company.change) && Number.isFinite(company.price))
      .sort((a, b) => a.change - b.change)
      .slice(0, limit)
      .map(c => ({
        symbol: c.symbol,
        price: c.price,
        changePercent: c.change,
        timestamp: observationTimestamp(c),
        dataStatus: c.marketData?.dataStatus || 'unavailable',
        lastUpdate: c.marketData?.lastUpdate || null
      }));

    res.json(prices);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
