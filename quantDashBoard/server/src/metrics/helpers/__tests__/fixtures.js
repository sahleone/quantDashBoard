// ─── Raw return series ──────────────────────────────────────────────
export const DAILY_RETURNS_5 = [0.01, -0.02, 0.015, -0.005, 0.008];

// Hand-calc for DAILY_RETURNS_5:
//   mean  = 0.008 / 5 = 0.0016
//   variance (ddof=1) = 0.0008012 / 4 = 0.0002003
//   stddev = sqrt(0.0002003) ≈ 0.014153
//   annualized vol = 0.014153 * sqrt(252) ≈ 0.22467
export const expectedVolatility5 = {
  raw: 0.014153,
  annualized: 0.22467,
  mean: 0.0016,
};

export const DAILY_RETURNS_20 = [
  0.005, -0.003, 0.008, -0.012, 0.002,
  0.007, -0.001, 0.004, -0.006, 0.009,
  -0.004, 0.006, 0.003, -0.008, 0.011,
  -0.002, 0.005, -0.007, 0.010, 0.001,
];

export const ZERO_RETURNS = [0, 0, 0, 0, 0];
export const POSITIVE_ONLY = [0.01, 0.02, 0.005, 0.015, 0.008];
export const NEGATIVE_ONLY = [-0.01, -0.02, -0.005, -0.015, -0.008];
export const SINGLE_RETURN = [0.05];
export const EMPTY_RETURNS = [];
export const RETURNS_WITH_NULLS = [0.01, null, -0.02, undefined, 0.015];

// ─── Equity index series (for drawdown) ─────────────────────────────
export const EQUITY_SIMPLE = [100, 110, 120, 105, 90, 95, 110];
export const expectedMaxDrawdown_Simple = 0.25; // (120-90)/120

export const EQUITY_MONOTONIC_UP = [100, 105, 110, 115, 120];
export const expectedMaxDrawdown_MonotonicUp = 0;

export const EQUITY_TAIL_DD = [100, 120, 130, 125, 100];
export const expectedMaxDrawdown_TailDD = 30 / 130;

export const EQUITY_MULTI_DD = [100, 110, 95, 108, 80, 105];
// Worst drawdown: peak 110, trough 80 → (110-80)/110 = 30/110 (not 28/108 from peak 108)
export const expectedMaxDrawdown_MultiDD = 30 / 110;

// ─── Beta / Correlation fixtures ────────────────────────────────────
export const BENCHMARK_RETURNS = [0.01, -0.015, 0.02, -0.005, 0.012, 0.003, -0.008, 0.007, -0.01, 0.015];
export const PORTFOLIO_MIRROR = [...BENCHMARK_RETURNS];
export const PORTFOLIO_2X = BENCHMARK_RETURNS.map(r => r * 2);
export const PORTFOLIO_INVERSE = BENCHMARK_RETURNS.map(r => -r);
export const BENCHMARK_CONSTANT = [0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];
export const SHORT_RETURNS = [0.01, -0.02, 0.015];

// ─── VaR fixtures ───────────────────────────────────────────────────
export const VAR_SIMPLE = [
  -0.10, -0.05, -0.03, -0.02, -0.01,
  0.00, 0.01, 0.02, 0.03, 0.04,
  0.05, 0.06, 0.07, 0.08, 0.09,
  0.10, 0.11, 0.12, 0.13, 0.14,
];

// ─── Sharpe / Sortino fixtures ──────────────────────────────────────
export const expectedSharpe5_rfr0 = (0.0016 * 252) / (0.014153 * Math.sqrt(252));
// Sortino downside deviation: helper uses (n-1) denominator, not n
// squaredDownside = [0, 0.0004, 0, 0.000025, 0], sum = 0.000425
// meanSquaredDownside = 0.000425 / (5 - 1) = 0.00010625
// downsideDev = sqrt(0.00010625) ≈ 0.010308
export const expectedSortino5_mar0_approx = (0.0016 * 252) / (Math.sqrt(0.000425 / 4) * Math.sqrt(252));

// ─── Point-to-point return fixtures ─────────────────────────────────
export const PTP_START = 10000;
export const PTP_END = 11500;
export const expectedPTP = (11500 - 10000) / 10000;

// ─── CAGR fixtures ──────────────────────────────────────────────────
export const CAGR_START = 10000;
export const CAGR_END = 12100;
export const CAGR_YEARS = 2;
export const expectedCAGR = Math.pow(12100 / 10000, 1 / 2) - 1;

// ─── Price series fixtures ──────────────────────────────────────────
export const PRICE_SERIES_A = [100, 102, 105, 103, 107, 110, 108, 112, 115, 118];
export const PRICE_SERIES_B = [50, 51, 52.5, 51.5, 53.5, 55, 54, 56, 57.5, 59];
