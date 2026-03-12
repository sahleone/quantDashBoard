/**
 * Tests for RFR-02: Remove dead riskFree preference
 *
 * Verifies that:
 * - Users.js schema no longer defines preferences.riskFree
 * - authController.js signup no longer sets riskFree in preferences
 * - preferences still has baseCurrency and benchmark
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/rfr02.jest.config.js
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const usersModelPath = resolve(REPO_ROOT, "server/src/models/Users.js");
const authControllerPath = resolve(REPO_ROOT, "server/src/controllers/authController.js");

describe("RFR-02 — Users.js schema", () => {
  let source;
  beforeAll(() => {
    source = readFileSync(usersModelPath, "utf-8");
  });

  test("preferences does NOT contain riskFree field", () => {
    // Should not have riskFree as a schema key
    expect(source).not.toMatch(/riskFree\s*:\s*\{/);
    expect(source).not.toMatch(/riskFree\s*:\s*[\"']/);
  });

  test("preferences still contains baseCurrency", () => {
    expect(source).toMatch(/baseCurrency\s*:\s*\{/);
  });

  test("preferences still contains benchmark", () => {
    expect(source).toMatch(/benchmark\s*:\s*\{/);
  });
});

describe("RFR-02 — authController.js signup", () => {
  let source;
  beforeAll(() => {
    source = readFileSync(authControllerPath, "utf-8");
  });

  test("signup preferences do NOT include riskFree", () => {
    // The signup payload should not set riskFree
    expect(source).not.toMatch(/riskFree\s*:\s*[\"']FF_RF[\"']/);
  });

  test("signup preferences still include baseCurrency and benchmark", () => {
    expect(source).toMatch(/baseCurrency\s*:\s*[\"']USD[\"']/);
    expect(source).toMatch(/benchmark\s*:\s*[\"']SPY[\"']/);
  });
});

describe("RFR-02 — no riskFree references in server source (excluding tests)", () => {
  test("grep finds no riskFree in Users.js", () => {
    const source = readFileSync(usersModelPath, "utf-8");
    expect(source).not.toMatch(/riskFree/);
  });

  test("grep finds no riskFree in authController.js", () => {
    const source = readFileSync(authControllerPath, "utf-8");
    expect(source).not.toMatch(/riskFree/);
  });
});
