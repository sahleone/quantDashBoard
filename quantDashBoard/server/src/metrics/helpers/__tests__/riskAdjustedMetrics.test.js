import {
  calculateSharpeRatio,
  calculateSortinoRatio,
  calculateReturnOverMaxDD,
} from '../riskAdjustedMetrics.js';

import {
  DAILY_RETURNS_5, DAILY_RETURNS_20, ZERO_RETURNS, POSITIVE_ONLY,
  NEGATIVE_ONLY, SINGLE_RETURN, EMPTY_RETURNS, RETURNS_WITH_NULLS,
  expectedVolatility5, expectedSharpe5_rfr0, expectedSortino5_mar0_approx,
} from './fixtures.js';


describe('calculateSharpeRatio', () => {
  test('annualized Sharpe matches hand-calculated value (rfr=0)', () => {
    expect(calculateSharpeRatio(DAILY_RETURNS_5, 0, true)).toBeCloseTo(expectedSharpe5_rfr0, 2);
  });

  test('risk-free rate = 0 simplifies to return/vol ratio', () => {
    const result = calculateSharpeRatio(DAILY_RETURNS_5, 0, true);
    const annReturn = expectedVolatility5.mean * 252;
    const annVol = expectedVolatility5.raw * Math.sqrt(252);
    expect(result).toBeCloseTo(annReturn / annVol, 2);
  });

  test('non-annualized Sharpe with rfr=0', () => {
    const result = calculateSharpeRatio(DAILY_RETURNS_5, 0, false);
    expect(result).toBeCloseTo(expectedVolatility5.mean / expectedVolatility5.raw, 2);
  });

  test('🔒 annualization uses mean*252 for return and stddev*sqrt(252) for vol', () => {
    const rfr = 0.04;
    const result = calculateSharpeRatio(DAILY_RETURNS_5, rfr, true);
    const expected = (expectedVolatility5.mean * 252 - rfr) / (expectedVolatility5.raw * Math.sqrt(252));
    expect(result).toBeCloseTo(expected, 2);
  });

  test('🔒 riskFreeRate affects the result', () => {
    const sharpe_rfr0 = calculateSharpeRatio(DAILY_RETURNS_5, 0, true);
    const sharpe_rfr5 = calculateSharpeRatio(DAILY_RETURNS_5, 0.05, true);
    expect(sharpe_rfr5).toBeLessThan(sharpe_rfr0);
  });

  test('all returns equal → volatility is 0 → returns null', () => {
    expect(calculateSharpeRatio([0.01, 0.01, 0.01, 0.01, 0.01], 0, true)).toBeNull();
  });

  test('negative excess return → negative Sharpe', () => {
    expect(calculateSharpeRatio(DAILY_RETURNS_5, 0.50, true)).toBeLessThan(0);
  });

  test('empty array → returns null', () => {
    expect(calculateSharpeRatio(EMPTY_RETURNS)).toBeNull();
  });

  test('single element → returns null', () => {
    expect(calculateSharpeRatio(SINGLE_RETURN)).toBeNull();
  });

  test('null input → returns null', () => {
    expect(calculateSharpeRatio(null)).toBeNull();
  });

  test('filters null/undefined values', () => {
    const result = calculateSharpeRatio(RETURNS_WITH_NULLS, 0, true);
    expect(result).not.toBeNull();
    expect(Number.isFinite(result)).toBe(true);
  });

  test('default parameters: rfr=0, annualized=true', () => {
    expect(calculateSharpeRatio(DAILY_RETURNS_5)).toBe(calculateSharpeRatio(DAILY_RETURNS_5, 0, true));
  });
});


describe('calculateSortinoRatio', () => {
  test('annualized Sortino approximately matches hand-calculated value', () => {
    expect(calculateSortinoRatio(DAILY_RETURNS_5, 0, true)).toBeCloseTo(expectedSortino5_mar0_approx, 1);
  });

  test('🔒 uses proper downside deviation, not sum/n', () => {
    const result = calculateSortinoRatio(DAILY_RETURNS_5, 0, false);
    const negReturns = DAILY_RETURNS_5.filter(r => r < 0);
    const wrongDD = Math.sqrt(negReturns.reduce((s, r) => s + r * r, 0) / negReturns.length);
    const wrongSortino = expectedVolatility5.mean / wrongDD;
    expect(Math.abs(result - wrongSortino)).toBeGreaterThan(0.01);
  });

  test('all returns above MAR → returns null', () => {
    expect(calculateSortinoRatio(POSITIVE_ONLY, 0, true)).toBeNull();
  });

  test('negative-only returns → finite negative Sortino', () => {
    const result = calculateSortinoRatio(NEGATIVE_ONLY, 0, true);
    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeLessThan(0);
  });

  test('MAR affects the result', () => {
    const s0 = calculateSortinoRatio(DAILY_RETURNS_5, 0, true);
    const s1 = calculateSortinoRatio(DAILY_RETURNS_5, 0.001, true);
    expect(s0).not.toBeCloseTo(s1, 2);
  });

  test('empty array → returns null', () => {
    expect(calculateSortinoRatio(EMPTY_RETURNS)).toBeNull();
  });

  test('single element → returns null', () => {
    expect(calculateSortinoRatio(SINGLE_RETURN)).toBeNull();
  });

  test('null input → returns null', () => {
    expect(calculateSortinoRatio(null)).toBeNull();
  });

  test('default parameters: mar=0, annualized=true', () => {
    expect(calculateSortinoRatio(DAILY_RETURNS_5)).toBe(calculateSortinoRatio(DAILY_RETURNS_5, 0, true));
  });
});


describe('calculateReturnOverMaxDD', () => {
  test('simple ratio: 20% / 10% = 2.0', () => {
    expect(calculateReturnOverMaxDD(0.20, 0.10)).toBeCloseTo(2.0, 10);
  });

  test('negative return with positive drawdown', () => {
    expect(calculateReturnOverMaxDD(-0.10, 0.20)).toBeCloseTo(-0.5, 10);
  });

  test('zero drawdown → handles gracefully', () => {
    const result = calculateReturnOverMaxDD(0.20, 0);
    expect(result === Infinity || result === null || result === 0).toBe(true);
  });

  test('zero return → returns 0', () => {
    expect(calculateReturnOverMaxDD(0, 0.10)).toBeCloseTo(0, 10);
  });
});
