/**
 * Tests for RFR-03: Unify all RF call sites
 *
 * Verifies that:
 * - metricsController.js no longer has a hardcoded riskFreeRate property
 * - metricsController.js imports getAnnualizedRiskFreeRate from famaFrenchService
 * - calculateMetrics.js imports getAnnualizedRiskFreeRate from famaFrenchService
 * - No hardcoded 0 or 0.02 is passed to calculateSharpeRatio
 * - Sortino MAR remains at 0 (intentional)
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/rfr03.jest.config.js
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const controllerPath = resolve(
  REPO_ROOT,
  "server/src/controllers/metricsController.js"
);
const pipelinePath = resolve(
  REPO_ROOT,
  "server/src/metrics/calculateMetrics.js"
);

let controllerSource;
let pipelineSource;

beforeAll(() => {
  controllerSource = readFileSync(controllerPath, "utf-8");
  pipelineSource = readFileSync(pipelinePath, "utf-8");
});

// ─── metricsController.js ───────────────────────────────────────────────────

describe("RFR-03 — metricsController.js", () => {

  test("imports getAnnualizedRiskFreeRate from famaFrenchService", () => {
    expect(controllerSource).toMatch(
      /import\s+\{[^}]*getAnnualizedRiskFreeRate[^}]*\}\s+from\s+["'][^"']*famaFrenchService/
    );
  });

  test("constructor does NOT set this.riskFreeRate", () => {
    // Should not have this.riskFreeRate assignment anywhere
    expect(controllerSource).not.toMatch(/this\.riskFreeRate\s*=/);
  });

  test("does NOT reference process.env.RISK_FREE_RATE", () => {
    expect(controllerSource).not.toMatch(/process\.env\.RISK_FREE_RATE/);
  });

  test("does NOT pass hardcoded 0.02 to calculateSharpeRatio", () => {
    expect(controllerSource).not.toMatch(
      /calculateSharpeRatio\s*\([^)]*0\.02/
    );
  });

  test("does NOT pass hardcoded 0 to calculateSharpeRatio (uses riskFreeRate variable)", () => {
    // Find all calculateSharpeRatio calls and check none pass literal 0
    const sharpeCallRegex = /calculateSharpeRatio\s*\(\s*\w+\s*,\s*(\w+|[^,)]+)/g;
    let match;
    const secondArgs = [];
    while ((match = sharpeCallRegex.exec(controllerSource)) !== null) {
      secondArgs.push(match[1].trim());
    }
    // Every second argument should be a variable name (like 'riskFreeRate'), not literal '0'
    for (const arg of secondArgs) {
      expect(arg).not.toBe("0");
      expect(arg).not.toBe("0.02");
    }
    // And there should be at least one call
    expect(secondArgs.length).toBeGreaterThanOrEqual(1);
  });

  test("Sortino MAR remains at 0 (intentional — not the same as RF)", () => {
    // Sortino calls should pass 0 for MAR
    expect(controllerSource).toMatch(/calculateSortinoRatio\s*\(\s*\w+\s*,\s*0\s*,/);
  });

  test("calls await getAnnualizedRiskFreeRate() in getPerformance or getKPIs", () => {
    expect(controllerSource).toMatch(/await\s+getAnnualizedRiskFreeRate\s*\(\s*\)/);
  });
});

// ─── calculateMetrics.js ────────────────────────────────────────────────────

describe("RFR-03 — calculateMetrics.js", () => {

  test("imports getAnnualizedRiskFreeRate from famaFrenchService", () => {
    expect(pipelineSource).toMatch(
      /import\s+\{[^}]*getAnnualizedRiskFreeRate[^}]*\}\s+from\s+["'][^"']*famaFrenchService/
    );
  });

  test("calls await getAnnualizedRiskFreeRate() before Sharpe calculation", () => {
    expect(pipelineSource).toMatch(/await\s+getAnnualizedRiskFreeRate\s*\(\s*\)/);
  });

  test("does NOT pass hardcoded 0 to calculateSharpeRatio", () => {
    // Find all calculateSharpeRatio calls
    const sharpeCallRegex = /calculateSharpeRatio\s*\(\s*\w+\s*,\s*(\w+|[^,)]+)/g;
    let match;
    const secondArgs = [];
    while ((match = sharpeCallRegex.exec(pipelineSource)) !== null) {
      secondArgs.push(match[1].trim());
    }
    for (const arg of secondArgs) {
      expect(arg).not.toBe("0");
    }
    expect(secondArgs.length).toBeGreaterThanOrEqual(1);
  });

  test("Sortino MAR remains at 0 (intentional)", () => {
    expect(pipelineSource).toMatch(/calculateSortinoRatio\s*\(\s*\w+\s*,\s*0\s*,/);
  });
});

// ─── Cross-check: no hardcoded RF anywhere ──────────────────────────────────

describe("RFR-03 — no hardcoded RF values remain", () => {

  test("metricsController has no '|| 0.02' pattern", () => {
    expect(controllerSource).not.toMatch(/\|\|\s*0\.02/);
  });

  test("neither file uses process.env.RISK_FREE_RATE", () => {
    expect(controllerSource).not.toMatch(/RISK_FREE_RATE/);
    expect(pipelineSource).not.toMatch(/RISK_FREE_RATE/);
  });
});
