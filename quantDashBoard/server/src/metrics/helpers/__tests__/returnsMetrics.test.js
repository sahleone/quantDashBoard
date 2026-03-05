import {
  calculatePointToPointReturn,
  calculateCAGR,
  calculateCAGRFromReturns,
  calculateTWR,
  calculateTWRFromDailyReturns,
} from '../returnsMetrics.js';

import {
  PTP_START, PTP_END, expectedPTP,
  CAGR_START, CAGR_END, CAGR_YEARS, expectedCAGR,
} from './fixtures.js';


describe('calculatePointToPointReturn', () => {
  test('basic return: 15%', () => {
    expect(calculatePointToPointReturn(PTP_START, PTP_END)).toBeCloseTo(expectedPTP, 10);
  });

  test('loss scenario', () => {
    expect(calculatePointToPointReturn(10000, 8000)).toBeCloseTo(-0.20, 10);
  });

  test('no change → 0', () => {
    expect(calculatePointToPointReturn(10000, 10000)).toBe(0);
  });

  test('start = 0 → returns 0', () => {
    expect(calculatePointToPointReturn(0, 5000)).toBe(0);
  });

  test('negative start → returns 0', () => {
    expect(calculatePointToPointReturn(-100, 5000)).toBe(0);
  });

  test('null start → returns 0', () => {
    expect(calculatePointToPointReturn(null, 5000)).toBe(0);
  });

  test('end = 0 → returns -1 (total loss)', () => {
    expect(calculatePointToPointReturn(10000, 0)).toBeCloseTo(-1.0, 10);
  });

  test('10× return', () => {
    expect(calculatePointToPointReturn(1000, 10000)).toBeCloseTo(9.0, 10);
  });
});


describe('calculateCAGR', () => {
  test('hand-calculated: sqrt(1.21) - 1 = 10%', () => {
    expect(calculateCAGR(CAGR_START, CAGR_END, CAGR_YEARS)).toBeCloseTo(expectedCAGR, 6);
  });

  test('1-year period: CAGR = simple return', () => {
    expect(calculateCAGR(10000, 11000, 1)).toBeCloseTo(0.10, 10);
  });

  test('total loss → -1', () => {
    expect(calculateCAGR(10000, 0, 2)).toBe(-1);
  });

  test('negative end → -1', () => {
    expect(calculateCAGR(10000, -500, 2)).toBe(-1);
  });

  test('zero years → 0', () => {
    expect(calculateCAGR(10000, 12000, 0)).toBe(0);
  });

  test('zero start → 0', () => {
    expect(calculateCAGR(0, 12000, 2)).toBe(0);
  });

  test('negative years → 0', () => {
    expect(calculateCAGR(10000, 12000, -1)).toBe(0);
  });

  test('fractional years', () => {
    expect(calculateCAGR(10000, 10500, 0.5)).toBeCloseTo(Math.pow(1.05, 2) - 1, 6);
  });
});


describe('calculateCAGRFromReturns', () => {
  test('flat daily returns annualize correctly', () => {
    const returns = new Array(252).fill(0.001);
    const totalReturn = Math.pow(1.001, 252) - 1;
    expect(calculateCAGRFromReturns(returns, 252)).toBeCloseTo(totalReturn, 4);
  });

  test('empty returns → 0', () => {
    expect(calculateCAGRFromReturns([], 252)).toBe(0);
  });

  test('null returns → 0', () => {
    expect(calculateCAGRFromReturns(null, 252)).toBe(0);
  });

  test('zero days → 0', () => {
    expect(calculateCAGRFromReturns([0.01, 0.02], 0)).toBe(0);
  });
});


describe('calculateTWR', () => {
  test('no cash flows → simple point-to-point', () => {
    const ts = [{ totalValue: 10000 }, { totalValue: 10500 }, { totalValue: 11000 }];
    expect(calculateTWR(ts, [])).toBeCloseTo(0.10, 4);
  });

  test('empty timeseries → 0', () => {
    expect(calculateTWR([], [])).toBe(0);
  });

  test('null timeseries → 0', () => {
    expect(calculateTWR(null, [])).toBe(0);
  });

  test('single data point → 0', () => {
    expect(calculateTWR([{ totalValue: 10000 }], [])).toBe(0);
  });
});


describe('calculateTWRFromDailyReturns', () => {
  test('sums log returns and converts to simple return', () => {
    const data = [
      { date: new Date('2024-01-01'), dailyTWRReturn: Math.log(1.01) },
      { date: new Date('2024-01-02'), dailyTWRReturn: Math.log(0.98) },
      { date: new Date('2024-01-03'), dailyTWRReturn: Math.log(1.015) },
    ];
    const expected = 1.01 * 0.98 * 1.015 - 1;
    expect(calculateTWRFromDailyReturns(data, new Date('2024-01-01'), new Date('2024-01-03'))).toBeCloseTo(expected, 6);
  });

  test('empty data → null', () => {
    expect(calculateTWRFromDailyReturns([], new Date('2024-01-01'), new Date('2024-01-31'))).toBeNull();
  });

  test('null data → null', () => {
    expect(calculateTWRFromDailyReturns(null, new Date('2024-01-01'), new Date('2024-01-31'))).toBeNull();
  });

  test('no data in range → null', () => {
    const data = [{ date: new Date('2024-06-01'), dailyTWRReturn: Math.log(1.01) }];
    expect(calculateTWRFromDailyReturns(data, new Date('2024-01-01'), new Date('2024-01-31'))).toBeNull();
  });

  test('skips null/NaN dailyTWRReturn', () => {
    const data = [
      { date: new Date('2024-01-01'), dailyTWRReturn: Math.log(1.01) },
      { date: new Date('2024-01-02'), dailyTWRReturn: null },
      { date: new Date('2024-01-03'), dailyTWRReturn: Math.log(1.02) },
    ];
    expect(calculateTWRFromDailyReturns(data, new Date('2024-01-01'), new Date('2024-01-03'))).toBeCloseTo(1.01 * 1.02 - 1, 6);
  });
});
