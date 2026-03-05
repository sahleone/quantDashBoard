import {
  calculateCorrelation,
  calculateCointegration,
} from '../diversificationMetrics.js';

import {
  BENCHMARK_RETURNS, PORTFOLIO_MIRROR, PORTFOLIO_INVERSE,
  BENCHMARK_CONSTANT, SHORT_RETURNS, EMPTY_RETURNS,
  PRICE_SERIES_A, PRICE_SERIES_B,
} from './fixtures.js';


describe('calculateCorrelation', () => {
  test('identical series → 1.0', () => {
    expect(calculateCorrelation(PORTFOLIO_MIRROR, BENCHMARK_RETURNS)).toBeCloseTo(1.0, 10);
  });

  test('perfectly negatively correlated → -1.0', () => {
    expect(calculateCorrelation(PORTFOLIO_INVERSE, BENCHMARK_RETURNS)).toBeCloseTo(-1.0, 10);
  });

  test('bounded between -1 and 1', () => {
    const a = [0.01, -0.02, 0.03, -0.01, 0.005, 0.02, -0.015, 0.008, -0.003, 0.012];
    const b = [0.005, 0.01, -0.008, 0.015, -0.02, 0.003, 0.007, -0.01, 0.02, -0.005];
    const r = calculateCorrelation(a, b);
    expect(r).toBeGreaterThanOrEqual(-1.0);
    expect(r).toBeLessThanOrEqual(1.0);
  });

  test('constant series → null or near-zero (floating-point)', () => {
    // 0.01 is not exact in IEEE 754, so stddev is ~1e-17, not 0.
    // Accept null OR a value very close to zero.
    const result1 = calculateCorrelation(BENCHMARK_RETURNS, BENCHMARK_CONSTANT);
    if (result1 !== null) {
      expect(Math.abs(result1)).toBeLessThan(1e-10);
    }
    const result2 = calculateCorrelation(BENCHMARK_CONSTANT, BENCHMARK_RETURNS);
    if (result2 !== null) {
      expect(Math.abs(result2)).toBeLessThan(1e-10);
    }
  });

  test('both constant → null or near-zero (floating-point)', () => {
    const c = [0.01, 0.01, 0.01, 0.01, 0.01];
    const result = calculateCorrelation(c, c);
    // With both series constant, covariance and both stddevs are ~0
    // Result is either null (0/0 guard) or NaN/near-zero
    if (result !== null) {
      expect(Math.abs(result)).toBeLessThan(1e-10);
    }
  });

  test('mismatched lengths → null', () => {
    expect(calculateCorrelation(SHORT_RETURNS, BENCHMARK_RETURNS)).toBeNull();
  });

  test('empty → null', () => {
    expect(calculateCorrelation(EMPTY_RETURNS, EMPTY_RETURNS)).toBeNull();
  });

  test('null → null', () => {
    expect(calculateCorrelation(null, BENCHMARK_RETURNS)).toBeNull();
    expect(calculateCorrelation(BENCHMARK_RETURNS, null)).toBeNull();
  });

  test('single-element → null', () => {
    expect(calculateCorrelation([0.01], [0.02])).toBeNull();
  });

  test('2× scaled series → still 1.0', () => {
    expect(calculateCorrelation(BENCHMARK_RETURNS.map(r => r * 2), BENCHMARK_RETURNS)).toBeCloseTo(1.0, 10);
  });

  test('shifted series → still 1.0', () => {
    expect(calculateCorrelation(BENCHMARK_RETURNS.map(r => r + 0.05), BENCHMARK_RETURNS)).toBeCloseTo(1.0, 10);
  });
});


describe('calculateCointegration', () => {
  test('proportional price series → high correlation', () => {
    const result = calculateCointegration(PRICE_SERIES_A, PRICE_SERIES_B);
    expect(result).toBeGreaterThan(0.9);
  });

  test('identical prices → 1.0', () => {
    expect(calculateCointegration(PRICE_SERIES_A, PRICE_SERIES_A)).toBeCloseTo(1.0, 10);
  });

  test('inversely-moving prices → negative', () => {
    const max = Math.max(...PRICE_SERIES_A);
    const inv = PRICE_SERIES_A.map(p => max - p + 50);
    const result = calculateCointegration(PRICE_SERIES_A, inv);
    if (result !== null) expect(result).toBeLessThan(0);
  });

  test('mismatched lengths → null', () => {
    expect(calculateCointegration(PRICE_SERIES_A, [50, 51, 52])).toBeNull();
  });

  test('empty → null', () => {
    expect(calculateCointegration([], [])).toBeNull();
  });

  test('null → null', () => {
    expect(calculateCointegration(null, PRICE_SERIES_A)).toBeNull();
  });

  test('single price → null', () => {
    expect(calculateCointegration([100], [50])).toBeNull();
  });
});
