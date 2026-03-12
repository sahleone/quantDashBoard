/**
 * Tests for SRV-02: Fix wrong model alias in SnapTradeController
 *
 * Verifies that snapTradeController.js imports AccountHoldings
 * (not AccountPositions) from models/AccountHoldings.js, and that
 * all Mongoose model-level operations use AccountHoldings.
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/srv02.jest.config.js
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const controllerPath = resolve(
  REPO_ROOT,
  "server/src/controllers/snapTradeController.js"
);

let source;
beforeAll(() => {
  source = readFileSync(controllerPath, "utf-8");
});

describe("SRV-02 — import alias corrected", () => {

  test("imports AccountHoldings from models/AccountHoldings.js", () => {
    expect(source).toMatch(
      /import\s+AccountHoldings\s+from\s+["']\.\.\/models\/AccountHoldings\.js["']/
    );
  });

  test("does NOT import AccountPositions from AccountHoldings.js", () => {
    // The old buggy import: import AccountPositions from "../models/AccountHoldings.js"
    expect(source).not.toMatch(
      /import\s+AccountPositions\s+from\s+["']\.\.\/models\/AccountHoldings\.js["']/
    );
  });
});

describe("SRV-02 — model operations use AccountHoldings", () => {

  test("AccountHoldings.find() is used (not AccountPositions.find())", () => {
    expect(source).toMatch(/AccountHoldings\.find\s*\(/);
    expect(source).not.toMatch(/AccountPositions\.find\s*\(/);
  });

  test("AccountHoldings.findOne() is used (not AccountPositions.findOne())", () => {
    expect(source).toMatch(/AccountHoldings\.findOne\s*\(/);
    expect(source).not.toMatch(/AccountPositions\.findOne\s*\(/);
  });

  test("new AccountHoldings() is used (not new AccountPositions())", () => {
    expect(source).toMatch(/new\s+AccountHoldings\s*\(/);
    expect(source).not.toMatch(/new\s+AccountPositions\s*\(/);
  });
});

describe("SRV-02 — other imports and methods unchanged", () => {

  test("still imports from expected model files", () => {
    expect(source).toMatch(/import\s+User\s+from\s+["']\.\.\/models\/Users\.js["']/);
    expect(source).toMatch(/import\s+Account\s+from\s+["']\.\.\/models\/AccountsList\.js["']/);
    expect(source).toMatch(/import\s+AccountBalances\s+from\s+["']\.\.\/models\/AccountBalances\.js["']/);
    expect(source).toMatch(/import\s+Metrics\s+from\s+["']\.\.\/models\/Metrics\.js["']/);
    expect(source).toMatch(/import\s+Options\s+from\s+["']\.\.\/models\/Options\.js["']/);
  });

  test("syncAccountPositions method still exists", () => {
    expect(source).toMatch(/async\s+syncAccountPositions\s*\(/);
  });

  test("getAccountPositions method still exists", () => {
    expect(source).toMatch(/async\s+getAccountPositions\s*\(/);
  });

  test("getUserPortfolio method still exists", () => {
    expect(source).toMatch(/async\s+getUserPortfolio\s*\(/);
  });
});
