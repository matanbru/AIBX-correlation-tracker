import test from 'node:test';
import assert from 'node:assert/strict';
import priceDataService, { getLastRefreshInfo } from '../services/priceDataService.js';

test('price data service exposes refresh metadata', () => {
  const info = getLastRefreshInfo();

  assert.equal(typeof priceDataService.getLastRefreshInfo, 'function');
  assert.equal(typeof info, 'object');
  assert.ok('status' in info);
  assert.ok('lastAttemptAt' in info);
});
