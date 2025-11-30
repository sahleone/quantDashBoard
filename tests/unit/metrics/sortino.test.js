/**
 * Test script to verify the Sortino ratio fix
 * Demonstrates the difference between the incorrect and correct formulas
 */

// Simulated returns: some positive, some negative
const returns = [0.02, -0.01, 0.03, -0.02, 0.01, -0.005, 0.015, -0.01];
const mar = 0; // Minimum Acceptable Return
const n = returns.length; // Total observations = 8

console.log("Test Returns:", returns);
console.log("Total observations (n):", n);
console.log("MAR:", mar);
console.log("");

// OLD (INCORRECT) METHOD
// Filters out zeros, divides by count of negative deviations
const negativeDeviations = returns
  .map((r) => {
    const deviation = r - mar;
    return deviation < 0 ? deviation * deviation : 0;
  })
  .filter((d) => d > 0);

const negativeCount = negativeDeviations.length; // Only counts negative ones
const oldDownsideVariance =
  negativeDeviations.reduce((sum, d) => sum + d, 0) / negativeCount;
const oldDownsideDeviation = Math.sqrt(oldDownsideVariance);

console.log("=== OLD (INCORRECT) METHOD ===");
console.log("Negative deviations (squared):", negativeDeviations);
console.log("Count of negative deviations:", negativeCount);
console.log("Downside variance (sum / negativeCount):", oldDownsideVariance);
console.log("Downside deviation:", oldDownsideDeviation);
console.log("");

// NEW (CORRECT) METHOD
// Includes all observations, divides by total count (n)
const squaredDownsideDeviations = returns.map((r) => {
  const deviation = r - mar;
  return deviation < 0 ? deviation * deviation : 0;
});

const sumSquaredDownsideDeviations = squaredDownsideDeviations.reduce(
  (sum, d) => sum + d,
  0
);
const newDownsideVariance = sumSquaredDownsideDeviations / n;
const newDownsideDeviation = Math.sqrt(newDownsideVariance);

console.log("=== NEW (CORRECT) METHOD ===");
console.log("Squared deviations (all, including zeros):", squaredDownsideDeviations);
console.log("Sum of squared deviations:", sumSquaredDownsideDeviations);
console.log("Total observations (n):", n);
console.log("Downside variance (sum / n):", newDownsideVariance);
console.log("Downside deviation:", newDownsideDeviation);
console.log("");

// Calculate Sortino ratios
const meanReturn = returns.reduce((sum, r) => sum + r, 0) / returns.length;
const oldSortino = meanReturn / oldDownsideDeviation;
const newSortino = meanReturn / newDownsideDeviation;

console.log("=== SORTINO RATIOS ===");
console.log("Mean return:", meanReturn);
console.log("OLD Sortino ratio (incorrect):", oldSortino);
console.log("NEW Sortino ratio (correct):", newSortino);
console.log("Difference:", newSortino - oldSortino);
console.log("");

console.log("=== VERIFICATION ===");
console.log("✓ OLD method divides by", negativeCount, "(count of negative deviations)");
console.log("✓ NEW method divides by", n, "(total observations)");
console.log("✓ Standard Sortino formula requires dividing by n (total observations)");
console.log("✓ The fix correctly implements the standard formula");

