import express from 'express';

const router = express.Router();

// Get all companies with pagination
router.get('/', (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const companies = req.db.companies.sort((a, b) => a.rank - b.rank);
    const total = companies.length;
    const paginated = companies.slice(skip, skip + limit);

    res.json({
      companies: paginated,
      opportunityCompanies: req.db.opportunityCompanies,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get company by ID
router.get('/:id', (req, res) => {
  try {
    const company = req.db.companies.find(c => c._id === req.params.id);
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get company by symbol
router.get('/symbol/:symbol', (req, res) => {
  try {
    const company = req.db.companies.find(c => c.symbol === req.params.symbol.toUpperCase());
    if (!company) return res.status(404).json({ error: 'Company not found' });
    res.json(company);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Search companies
router.get('/search/:query', (req, res) => {
  try {
    const query = req.params.query.toLowerCase();
    const companies = req.db.companies.filter(c =>
      c.name.toLowerCase().includes(query) || c.symbol.toLowerCase().includes(query)
    ).slice(0, 10);
    res.json(companies);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create company (admin only)
router.post('/', (req, res) => {
  try {
    const company = { _id: Date.now().toString(), ...req.body };
    req.db.companies.push(company);
    res.status(201).json(company);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update company (admin only)
router.put('/:id', (req, res) => {
  try {
    const index = req.db.companies.findIndex(c => c._id === req.params.id);
    if (index === -1) return res.status(404).json({ error: 'Company not found' });
    
    req.db.companies[index] = { ...req.db.companies[index], ...req.body };
    res.json(req.db.companies[index]);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
