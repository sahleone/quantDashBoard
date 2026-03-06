/**
 * Tests for Phase 0 Bug Fixes (Tasks 14 & 15)
 *
 * Task 14: Auth middleware filename case — verify authMiddleware.js (camelCase)
 *          exists and exports the expected functions.
 * Task 15: ESM compliance in connections.js — verify no require() calls remain.
 *
 * Run from repo root:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/phase0.jest.config.js
 */

import { existsSync, readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Paths relative to repo root (tests live in server/src/__tests__/)
const REPO_ROOT = resolve(__dirname, "../../..");
const MIDDLEWARE_DIR = resolve(REPO_ROOT, "server/src/middleware");
const ROUTES_DIR = resolve(REPO_ROOT, "server/src/routes");

// ─── Task 14: Auth middleware filename case ──────────────────────────────────

describe("Task 14 — authMiddleware.js filename case", () => {
  test("authMiddleware.js (camelCase) exists in middleware/", () => {
    // On a case-sensitive filesystem (Linux/Docker/CI), this will fail
    // if the file is still named authmiddleware.js (all lowercase).
    const target = resolve(MIDDLEWARE_DIR, "authMiddleware.js");
    expect(existsSync(target)).toBe(true);
  });

  test("authmiddleware.js (all lowercase) does NOT exist as a separate file", async () => {
    // After the rename, only camelCase should remain.
    // Use a directory listing to detect both files coexisting (shouldn't happen).
    const { readdirSync } = await import("fs");
    const files = readdirSync(MIDDLEWARE_DIR);
    const authFiles = files.filter((f) =>
      f.toLowerCase() === "authmiddleware.js"
    );
    // Exactly one file matching (case-insensitive), and it must be camelCase
    expect(authFiles).toHaveLength(1);
    expect(authFiles[0]).toBe("authMiddleware.js");
  });

  test("authMiddleware.js exports requireAuth and checkUser", async () => {
    const mod = await import(
      resolve(MIDDLEWARE_DIR, "authMiddleware.js")
    );
    expect(typeof mod.requireAuth).toBe("function");
    expect(typeof mod.checkUser).toBe("function");
  });

  test("all route files reference authMiddleware.js (camelCase) in imports", () => {
    const routeFiles = [
      "accounts.js",
      "connections.js",
      "metrics.js",
      "snapTrade.js",
      "user.js",
    ];
    const appFile = resolve(REPO_ROOT, "server/src/app.js");

    const filesToCheck = [
      ...routeFiles.map((f) => resolve(ROUTES_DIR, f)),
      appFile,
    ];

    for (const filePath of filesToCheck) {
      const content = readFileSync(filePath, "utf-8");
      // If this file imports from the middleware, it must use camelCase
      if (content.includes("middleware/auth")) {
        expect(content).toMatch(/middleware\/authMiddleware\.js/);
        expect(content).not.toMatch(/middleware\/authmiddleware\.js/);
      }
    }
  });
});

// ─── Task 15: ESM compliance in connections.js ───────────────────────────────

describe("Task 15 — connections.js ESM compliance", () => {
  const connectionsPath = resolve(ROUTES_DIR, "connections.js");

  let source;
  beforeAll(() => {
    source = readFileSync(connectionsPath, "utf-8");
  });

  test("connections.js contains no require() calls", () => {
    // Match require('...') or require("...") anywhere in the file.
    // Ignore comments — a simple regex is fine here because a real require()
    // on a non-comment line is the bug we care about.
    const codeLines = source
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("//") && !line.trimStart().startsWith("*"));

    const requireLines = codeLines.filter((line) =>
      /\brequire\s*\(/.test(line)
    );

    expect(requireLines).toEqual([]);
  });

  test("jsonwebtoken is imported via ESM at the top level", () => {
    expect(source).toMatch(/^import\s+jwt\s+from\s+["']jsonwebtoken["']/m);
  });

  test("config is imported via ESM at the top level", () => {
    expect(source).toMatch(
      /^import\s+\{\s*config\s*\}\s+from\s+["']\.\.\/config\/environment\.js["']/m
    );
  });

  test("debug endpoint still references jwt.decode and jwt.verify", () => {
    // Ensure the debug handler wasn't accidentally broken — it should
    // still call jwt.decode() and jwt.verify() using the top-level import.
    expect(source).toMatch(/jwt\.decode\s*\(/);
    expect(source).toMatch(/jwt\.verify\s*\(/);
  });

  test("debug endpoint still references config.jwt.secret", () => {
    expect(source).toMatch(/config\.jwt\.secret/);
  });
});
