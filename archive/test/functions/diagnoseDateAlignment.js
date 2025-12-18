import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";

/**
 * Diagnoses date alignment issues between cash and securities series
 * Helps identify why spikes occur in the combined portfolio series
 *
 * @param {Object} opts - Options object
 * @param {Array} opts.cashSeries - Cash series from buildDailyCashSeries
 * @param {Array} opts.securitiesValueSeries - Securities value series from buildDailySecurityValuesSeries
 * @returns {Object} Diagnostic report
 */
export function diagnoseDateAlignment(opts = {}) {
  const { cashSeries, securitiesValueSeries } = opts;

  const cashDates = new Set();
  const securitiesDates = new Set();
  const cashByDate = new Map();
  const securitiesByDate = new Map();

  // Collect cash dates
  if (Array.isArray(cashSeries) && cashSeries.length > 0) {
    for (const entry of cashSeries) {
      if (entry.date) {
        const dateKey = formatDateToYYYYMMDD(entry.date);
        if (dateKey) {
          cashDates.add(dateKey);
          cashByDate.set(dateKey, entry.cash || 0);
        }
      }
    }
  }

  // Collect securities dates
  if (
    Array.isArray(securitiesValueSeries) &&
    securitiesValueSeries.length > 0
  ) {
    for (const entry of securitiesValueSeries) {
      if (entry.date) {
        const dateKey = formatDateToYYYYMMDD(entry.date);
        if (dateKey) {
          securitiesDates.add(dateKey);
          securitiesByDate.set(dateKey, entry.totalSecuritiesValue || 0);
        }
      }
    }
  }

  // Find dates in cash but not in securities
  const cashOnlyDates = [];
  for (const date of cashDates) {
    if (!securitiesDates.has(date)) {
      cashOnlyDates.push(date);
    }
  }

  // Find dates in securities but not in cash
  const securitiesOnlyDates = [];
  for (const date of securitiesDates) {
    if (!cashDates.has(date)) {
      securitiesOnlyDates.push(date);
    }
  }

  // Find common dates
  const commonDates = [];
  for (const date of cashDates) {
    if (securitiesDates.has(date)) {
      commonDates.push(date);
    }
  }

  // Sort all date arrays
  cashOnlyDates.sort();
  securitiesOnlyDates.sort();
  commonDates.sort();

  // Find dates with significant changes that might cause spikes
  const suspiciousDates = [];
  let prevCash = null;
  let prevSecurities = null;

  const allDates = Array.from(
    new Set([...cashDates, ...securitiesDates])
  ).sort();

  for (const date of allDates) {
    const cash = cashByDate.get(date) ?? prevCash ?? 0;
    const securities = securitiesByDate.get(date) ?? prevSecurities ?? 0;

    if (prevCash !== null && prevSecurities !== null) {
      const cashChange = Math.abs(cash - prevCash);
      const securitiesChange = Math.abs(securities - prevSecurities);
      const portfolioChange = Math.abs(
        cash + securities - (prevCash + prevSecurities)
      );

      // Flag if one component changes significantly but the other doesn't
      // This can cause spikes when combined
      if (
        (cashChange > 1000 && securitiesChange < 100) ||
        (securitiesChange > 1000 && cashChange < 100)
      ) {
        suspiciousDates.push({
          date,
          cashChange,
          securitiesChange,
          portfolioChange,
          cash,
          securities,
          prevCash,
          prevSecurities,
        });
      }
    }

    prevCash = cash;
    prevSecurities = securities;
  }

  // Calculate date range info
  const allDatesSorted = allDates.sort();
  const startDate = allDatesSorted[0] || null;
  const endDate = allDatesSorted[allDatesSorted.length - 1] || null;

  const cashDatesSorted = Array.from(cashDates).sort();
  const securitiesDatesSorted = Array.from(securitiesDates).sort();

  return {
    summary: {
      totalCashDates: cashDates.size,
      totalSecuritiesDates: securitiesDates.size,
      commonDates: commonDates.length,
      cashOnlyDates: cashOnlyDates.length,
      securitiesOnlyDates: securitiesOnlyDates.length,
      startDate,
      endDate,
      cashStartDate: cashDatesSorted[0] || null,
      cashEndDate: cashDatesSorted[cashDatesSorted.length - 1] || null,
      securitiesStartDate: securitiesDatesSorted[0] || null,
      securitiesEndDate:
        securitiesDatesSorted[securitiesDatesSorted.length - 1] || null,
    },
    misalignments: {
      cashOnlyDates: cashOnlyDates.slice(0, 20), // First 20
      securitiesOnlyDates: securitiesOnlyDates.slice(0, 20), // First 20
      totalCashOnly: cashOnlyDates.length,
      totalSecuritiesOnly: securitiesOnlyDates.length,
    },
    suspiciousDates: suspiciousDates.slice(0, 50), // First 50
    totalSuspiciousDates: suspiciousDates.length,
  };
}

/**
 * Logs a formatted diagnostic report
 */
export function logDateAlignmentDiagnostic(diagnostic) {
  console.log("\n" + "=".repeat(60));
  console.log("DATE ALIGNMENT DIAGNOSTIC");
  console.log("=".repeat(60));

  console.log("\n📊 Summary:");
  console.log(`  Cash series dates: ${diagnostic.summary.totalCashDates}`);
  console.log(
    `  Securities series dates: ${diagnostic.summary.totalSecuritiesDates}`
  );
  console.log(`  Common dates: ${diagnostic.summary.commonDates}`);
  console.log(`  Cash-only dates: ${diagnostic.summary.cashOnlyDates}`);
  console.log(
    `  Securities-only dates: ${diagnostic.summary.securitiesOnlyDates}`
  );

  console.log("\n📅 Date Ranges:");
  console.log(
    `  Overall: ${diagnostic.summary.startDate} to ${diagnostic.summary.endDate}`
  );
  console.log(
    `  Cash: ${diagnostic.summary.cashStartDate} to ${diagnostic.summary.cashEndDate}`
  );
  console.log(
    `  Securities: ${diagnostic.summary.securitiesStartDate} to ${diagnostic.summary.securitiesEndDate}`
  );

  if (diagnostic.misalignments.totalCashOnly > 0) {
    console.log(
      `\n⚠️  Found ${diagnostic.misalignments.totalCashOnly} dates in cash but not in securities:`
    );
    console.log(
      `  First 20: ${diagnostic.misalignments.cashOnlyDates.join(", ")}`
    );
  }

  if (diagnostic.misalignments.totalSecuritiesOnly > 0) {
    console.log(
      `\n⚠️  Found ${diagnostic.misalignments.totalSecuritiesOnly} dates in securities but not in cash:`
    );
    console.log(
      `  First 20: ${diagnostic.misalignments.securitiesOnlyDates.join(", ")}`
    );
  }

  if (diagnostic.totalSuspiciousDates > 0) {
    console.log(
      `\n🚨 Found ${diagnostic.totalSuspiciousDates} dates with potential spike-causing misalignments:`
    );
    for (const suspicious of diagnostic.suspiciousDates.slice(0, 10)) {
      console.log(
        `  ${suspicious.date}: Cash ${
          suspicious.cashChange > 1000 ? "SPIKE" : "ok"
        } (${suspicious.cashChange.toFixed(2)}), ` +
          `Securities ${
            suspicious.securitiesChange > 1000 ? "SPIKE" : "ok"
          } (${suspicious.securitiesChange.toFixed(2)}), ` +
          `Portfolio change: ${suspicious.portfolioChange.toFixed(2)}`
      );
    }
    if (diagnostic.totalSuspiciousDates > 10) {
      console.log(`  ... and ${diagnostic.totalSuspiciousDates - 10} more`);
    }
  }

  console.log("\n" + "=".repeat(60) + "\n");
}
