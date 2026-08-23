import express from 'express';
import yieldsDataService from '../services/yieldsDataService.js';

const router = express.Router();
const supportedSeries = new Set(['10y', '30y']);
const supportedRanges = new Set(['1y', '3y', '5y']);

const validateQuery = (req, res) => {
  const series = req.query.series || '10y';
  const range = req.query.range || '1y';
  if (!supportedSeries.has(series) || !supportedRanges.has(range)) {
    res.status(400).json({ error: 'series must be 10y or 30y; range must be 1y, 3y, or 5y' });
    return null;
  }
  return { series, range };
};

const correlation = (left, right) => {
  const leftMean = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / right.length;
  let covariance = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  left.forEach((value, index) => {
    const leftDiff = value - leftMean;
    const rightDiff = right[index] - rightMean;
    covariance += leftDiff * rightDiff;
    leftVariance += leftDiff ** 2;
    rightVariance += rightDiff ** 2;
  });
  return leftVariance && rightVariance ? covariance / Math.sqrt(leftVariance * rightVariance) : 0;
};

const basketLevels = (companies, startDate) => {
  const constituents = companies
    .filter((company) => Array.isArray(company.priceHistory) && company.priceHistory.length > 1)
    .sort((left, right) => Number(right.metrics?.marketCap || 0) - Number(left.metrics?.marketCap || 0))
    .slice(0, 10);
  if (!constituents.length) return [];

  const series = constituents.map((company) => new Map(
    company.priceHistory
      .filter((point) => point.date >= startDate && Number.isFinite(Number(point.adjustedClose)))
      .map((point) => [point.date, Number(point.adjustedClose)])
  ));
  const dates = [...series[0].keys()].filter((date) => series.every((values) => values.has(date))).sort();
  const totalMarketCap = constituents.reduce((sum, company) => sum + Number(company.metrics?.marketCap || 0), 0);
  const weights = constituents.map((company) => totalMarketCap
    ? Number(company.metrics?.marketCap || 0) / totalMarketCap
    : 1 / constituents.length);

  let level = 100;
  return dates.map((date, index) => {
    if (index) {
      const previousDate = dates[index - 1];
      const dailyReturn = series.reduce((sum, values, seriesIndex) => (
        sum + weights[seriesIndex] * ((values.get(date) - values.get(previousDate)) / values.get(previousDate))
      ), 0);
      level *= 1 + dailyReturn;
    }
    return { date, level };
  });
};

router.get('/real', (req, res) => {
  const query = validateQuery(req, res);
  if (!query) return;
  const data = yieldsDataService.getSeries(query.series, query.range);
  if (!data.length) {
    return res.status(503).json({ error: 'Yield cache is empty. Add FRED_API_KEY to backend/.env and restart the backend.' });
  }
  res.json({ series: query.series, range: query.range, updatedAt: yieldsDataService.loadYieldsFromDisk().updatedAt || null, data });
});

router.get('/correlation', (req, res) => {
  const query = validateQuery(req, res);
  if (!query) return;
  const yields = yieldsDataService.getSeries(query.series, query.range);
  if (!yields.length) {
    return res.status(503).json({ error: 'Yield cache is empty. Add FRED_API_KEY to backend/.env and restart the backend.' });
  }

  const yieldByDate = new Map(yields.map((point) => [point.date, point.value]));
  const basket = basketLevels(req.db.companies || [], yields[0].date);
  const aligned = basket.filter((point) => yieldByDate.has(point.date));
  const windowSize = 30;
  const data = [];
  for (let index = 1; index < aligned.length; index += 1) {
    const yieldChange = yieldByDate.get(aligned[index].date) - yieldByDate.get(aligned[index - 1].date);
    const basketReturn = Math.log(aligned[index].level / aligned[index - 1].level);
    if (!Number.isFinite(yieldChange) || !Number.isFinite(basketReturn)) continue;
    const previous = data.at(-1);
    data.push({ date: aligned[index].date, yieldChange, basketReturn, correlation: previous?.correlation ?? null });
  }
  for (let index = windowSize - 1; index < data.length; index += 1) {
    const window = data.slice(index - windowSize + 1, index + 1);
    data[index].correlation = Number(correlation(
      window.map((point) => point.yieldChange),
      window.map((point) => point.basketReturn)
    ).toFixed(4));
  }
  res.json({ series: query.series, range: query.range, windowSize, data: data.filter((point) => point.correlation !== null) });
});

export default router;