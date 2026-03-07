import { getDateRange, mapRangeToPeriod } from '../dateRanges.js';

// ── getDateRange ────────────────────────────────────────────────────────

describe('getDateRange', () => {
  test('1M from 2025-03-31 clamps to Feb 28', () => {
    const { startDate, endDate } = getDateRange('1M', new Date('2025-03-31T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2025-02-28T00:00:00.000Z');
    expect(endDate.toISOString()).toBe('2025-03-31T23:59:59.999Z');
  });

  test('1M from 2024-03-31 clamps to Feb 29 (leap year)', () => {
    const { startDate } = getDateRange('1M', new Date('2024-03-31T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2024-02-29T00:00:00.000Z');
  });

  test('3M from 2025-01-31 clamps to Oct 31', () => {
    const { startDate } = getDateRange('3M', new Date('2025-01-31T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2024-10-31T00:00:00.000Z');
  });

  test('3M wraps year boundary: from 2025-02-15', () => {
    const { startDate } = getDateRange('3M', new Date('2025-02-15T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2024-11-15T00:00:00.000Z');
  });

  test('YTD returns Jan 1 of same year', () => {
    const { startDate } = getDateRange('YTD', new Date('2025-06-15T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2025-01-01T00:00:00.000Z');
  });

  test('1Y from 2025-02-28 → 2024-02-28', () => {
    const { startDate } = getDateRange('1Y', new Date('2025-02-28T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2024-02-28T00:00:00.000Z');
  });

  test('1Y from 2024-02-29 (leap) clamps to 2023-02-28', () => {
    const { startDate } = getDateRange('1Y', new Date('2024-02-29T12:00:00Z'));
    expect(startDate.toISOString()).toBe('2023-02-28T00:00:00.000Z');
  });

  test('ALL returns startDate: null', () => {
    const { startDate, endDate } = getDateRange('ALL', new Date('2025-01-01T00:00:00Z'));
    expect(startDate).toBeNull();
    expect(endDate).toBeDefined();
  });

  test('ITD is alias for ALL', () => {
    const { startDate } = getDateRange('ITD', new Date('2025-06-01T12:00:00Z'));
    expect(startDate).toBeNull();
  });

  test('ALLTIME is alias for ALL', () => {
    const { startDate } = getDateRange('ALLTIME', new Date('2025-06-01T12:00:00Z'));
    expect(startDate).toBeNull();
  });

  test('case-insensitive: 1m, ytd, all all work', () => {
    const d = new Date('2025-06-15T12:00:00Z');
    expect(() => getDateRange('1m', d)).not.toThrow();
    expect(() => getDateRange('ytd', d)).not.toThrow();
    expect(() => getDateRange('all', d)).not.toThrow();

    const { startDate: s1m } = getDateRange('1m', d);
    const { startDate: s1M } = getDateRange('1M', d);
    expect(s1m.toISOString()).toBe(s1M.toISOString());
  });

  test('unknown range throws Error', () => {
    expect(() => getDateRange('INVALID', new Date('2025-01-01T00:00:00Z')))
      .toThrow('Unknown range: INVALID');
  });

  test('endDate always has time 23:59:59.999 UTC', () => {
    const d = new Date('2025-06-15T12:00:00Z');
    for (const r of ['1M', '3M', 'YTD', '1Y', 'ALL']) {
      const { endDate } = getDateRange(r, d);
      expect(endDate.getUTCHours()).toBe(23);
      expect(endDate.getUTCMinutes()).toBe(59);
      expect(endDate.getUTCSeconds()).toBe(59);
      expect(endDate.getUTCMilliseconds()).toBe(999);
    }
  });

  test('defaults asOfDate to now when omitted', () => {
    const { endDate } = getDateRange('YTD');
    expect(endDate.getUTCFullYear()).toBe(new Date().getUTCFullYear());
  });
});

// ── mapRangeToPeriod ────────────────────────────────────────────────────

describe('mapRangeToPeriod', () => {
  test('maps canonical ranges to themselves', () => {
    expect(mapRangeToPeriod('1M')).toBe('1M');
    expect(mapRangeToPeriod('3M')).toBe('3M');
    expect(mapRangeToPeriod('YTD')).toBe('YTD');
    expect(mapRangeToPeriod('1Y')).toBe('1Y');
    expect(mapRangeToPeriod('ALL')).toBe('ALL');
  });

  test('maps aliases', () => {
    expect(mapRangeToPeriod('ITD')).toBe('ALL');
    expect(mapRangeToPeriod('ALLTIME')).toBe('ALL');
  });

  test('unknown defaults to ALL', () => {
    expect(mapRangeToPeriod('INVALID')).toBe('ALL');
  });

  test('case-insensitive', () => {
    expect(mapRangeToPeriod('ytd')).toBe('YTD');
    expect(mapRangeToPeriod('1m')).toBe('1M');
    expect(mapRangeToPeriod('all')).toBe('ALL');
  });
});
