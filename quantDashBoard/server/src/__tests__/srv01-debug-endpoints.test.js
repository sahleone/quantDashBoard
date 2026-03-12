/**
 * Tests for SRV-01: Remove debug/test endpoints from connections.js
 *
 * Verifies that the /debug and /test endpoints have been removed,
 * along with the jwt and config imports that only served them.
 * Also verifies that legitimate routes are still present.
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/srv01.jest.config.js
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const ROUTES_DIR = resolve(REPO_ROOT, "server/src/routes");
const connectionsPath = resolve(ROUTES_DIR, "connections.js");

let source;
beforeAll(() => {
  source = readFileSync(connectionsPath, "utf-8");
});

// ─── Removed endpoints ──────────────────────────────────────────────────────

describe("SRV-01 — debug/test endpoints removed", () => {
  test('no router.get("/debug" handler exists', () => {
    expect(source).not.toMatch(/router\.get\s*\(\s*["']\/debug["']/);
  });

  test('no router.get("/test" handler exists', () => {
    expect(source).not.toMatch(/router\.get\s*\(\s*["']\/test["']/);
  });

  test("no JWT token decoding or verification in routes file", () => {
    expect(source).not.toMatch(/jwt\.decode\s*\(/);
    expect(source).not.toMatch(/jwt\.verify\s*\(/);
  });

  test("no tokenPreview or token length leak", () => {
    expect(source).not.toMatch(/tokenPreview/);
    expect(source).not.toMatch(/token\.length/);
    expect(source).not.toMatch(/token\.substring/);
  });

  test("no userSecret leak in response payloads", () => {
    // The debug/test endpoints exposed userSecret presence.
    // Legitimate routes don't include userSecret in res.json() calls.
    expect(source).not.toMatch(/userSecret\s*[?:]/);
  });

  test("no raw cookies or headers object in response payloads", () => {
    expect(source).not.toMatch(/cookies:\s*req\.cookies/);
    expect(source).not.toMatch(/headers:\s*\{[^}]*authorization:\s*req\.headers/);
  });
});

// ─── Dead imports removed ───────────────────────────────────────────────────

describe("SRV-01 — dead imports removed", () => {
  test("jsonwebtoken is not imported", () => {
    expect(source).not.toMatch(/\bimport\b.*\bjsonwebtoken\b/);
  });

  test("config/environment.js is not imported", () => {
    expect(source).not.toMatch(/\bimport\b.*config\/environment/);
  });
});

// ─── Legitimate routes still present ────────────────────────────────────────

describe("SRV-01 — legitimate routes preserved", () => {
  test('POST /snaptrade/portal route exists', () => {
    expect(source).toMatch(/router\.post\s*\(\s*["']\/snaptrade\/portal["']/);
  });

  test('POST /snaptrade/exchange route exists', () => {
    expect(source).toMatch(/router\.post\s*\(\s*["']\/snaptrade\/exchange["']/);
  });

  test('GET / (listConnections) route exists', () => {
    expect(source).toMatch(/router\.get\s*\(\s*["']\/["']/);
  });

  test('DELETE /:connectionId route exists', () => {
    expect(source).toMatch(/router\.delete\s*\(\s*["']\/:connectionId["']/);
  });

  test('GET /health route exists', () => {
    expect(source).toMatch(/router\.get\s*\(\s*["']\/health["']/);
  });

  test('POST /refresh route exists', () => {
    expect(source).toMatch(/router\.post\s*\(\s*["']\/refresh["']/);
  });

  test("requireAuth middleware is still applied", () => {
    expect(source).toMatch(/router\.use\s*\(\s*requireAuth\s*\)/);
  });
});
