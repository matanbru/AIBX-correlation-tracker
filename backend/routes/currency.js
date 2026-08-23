import express from 'express';
import axios from 'axios';

const router = express.Router();

const formatDate = (date) => {
  const offsetMs = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
};

router.get('/strength', async (req, res) => {
  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);

    const url = `https://api.frankfurter.app/${formatDate(startDate)}..${formatDate(endDate)}?from=USD&to=GBP,CAD,EUR`;
    const { data } = await axios.get(url, { timeout: 15000 });

    if (!data?.rates || !Object.keys(data.rates).length) {
      return res.status(502).json({ error: 'Currency provider returned no rates.' });
    }

    const series = Object.entries(data.rates)
      .sort(([leftDate], [rightDate]) => new Date(leftDate) - new Date(rightDate))
      .map(([date, rates]) => ({
        date,
        GBP: Number(rates?.GBP ?? 0),
        CAD: Number(rates?.CAD ?? 0),
        EUR: Number(rates?.EUR ?? 0)
      }));

    res.json({
      base: data.base || 'USD',
      startDate: data.start_date || series[0]?.date || null,
      endDate: data.end_date || series.at(-1)?.date || null,
      data: series
    });
  } catch (error) {
    const status = Number(error?.response?.status) || 502;
    const message = error?.response?.data?.message || error.message || 'Failed to fetch currency rates.';
    res.status(status).json({ error: message });
  }
});

export default router;