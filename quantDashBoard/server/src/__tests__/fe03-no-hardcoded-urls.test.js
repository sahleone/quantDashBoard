/**
 * Tests for FE-03: Replace hardcoded localhost:3000 URLs
 *
 * Verifies that no frontend component files contain hardcoded
 * http://localhost:3000 URLs (except apiClient/authInterceptor/StockInfo
 * which define API_BASE with a localhost fallback).
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/fe03.jest.config.js
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { resolve, dirname, extname, join } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const CLIENT_SRC = resolve(REPO_ROOT, "client/src");

// Files that legitimately define API_BASE with a localhost fallback
const ALLOWED_FILES = new Set([
  resolve(CLIENT_SRC, "utils/apiClient.js"),
  resolve(CLIENT_SRC, "utils/authInterceptor.js"),
  resolve(CLIENT_SRC, "pages/stockInfo/StockInfo.jsx"),
]);

/**
 * Recursively collect all .js/.jsx files under a directory
 */
function collectFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectFiles(full, files);
    } else if ([".js", ".jsx"].includes(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

// ─── No hardcoded localhost URLs ─────────────────────────────────────────────

describe("FE-03 — no hardcoded localhost:3000 URLs in client source", () => {

  const allFiles = collectFiles(CLIENT_SRC);
  const filesToCheck = allFiles.filter((f) => !ALLOWED_FILES.has(f));

  test("at least 10 client source files found (sanity check)", () => {
    expect(allFiles.length).toBeGreaterThanOrEqual(10);
  });

  for (const filePath of filesToCheck) {
    const relPath = filePath.replace(REPO_ROOT + "/", "");

    test(`${relPath} does not contain http://localhost:3000`, () => {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const offendingLines = lines
        .map((line, i) => ({ line: line.trim(), num: i + 1 }))
        .filter(({ line }) => line.includes("http://localhost:3000"))
        .filter(({ line }) => !line.startsWith("//") && !line.startsWith("*"));

      if (offendingLines.length > 0) {
        const detail = offendingLines
          .map(({ num, line }) => `  L${num}: ${line}`)
          .join("\n");
        fail(
          `Found ${offendingLines.length} hardcoded localhost:3000 URL(s):\n${detail}`
        );
      }
    });
  }
});

// ─── Specific file checks ───────────────────────────────────────────────────

describe("FE-03 — Login.jsx uses apiClient", () => {
  const filePath = resolve(CLIENT_SRC, "components/login/Login.jsx");
  let source;
  beforeAll(() => { source = readFileSync(filePath, "utf-8"); });

  test("imports authenticatedPost from apiClient", () => {
    expect(source).toMatch(/import\s+\{[^}]*authenticatedPost[^}]*\}\s+from\s+["'][^"']*apiClient/);
  });

  test("does not import axios directly", () => {
    expect(source).not.toMatch(/import\s+axios\s+from\s+["']axios["']/);
  });
});

describe("FE-03 — Signup.jsx uses apiClient", () => {
  const filePath = resolve(CLIENT_SRC, "pages/auth/Signup.jsx");
  let source;
  beforeAll(() => { source = readFileSync(filePath, "utf-8"); });

  test("imports authenticatedPost from apiClient", () => {
    expect(source).toMatch(/import\s+\{[^}]*authenticatedPost[^}]*\}\s+from\s+["'][^"']*apiClient/);
  });

  test("does not import axios directly", () => {
    expect(source).not.toMatch(/import\s+axios\s+from\s+["']axios["']/);
  });
});

describe("FE-03 — Logout.jsx uses apiClient", () => {
  const filePath = resolve(CLIENT_SRC, "components/auth/Logout.jsx");
  let source;
  beforeAll(() => { source = readFileSync(filePath, "utf-8"); });

  test("imports authenticatedPost from apiClient", () => {
    expect(source).toMatch(/import\s+\{[^}]*authenticatedPost[^}]*\}\s+from\s+["'][^"']*apiClient/);
  });

  test("does not import axios directly", () => {
    expect(source).not.toMatch(/import\s+axios\s+from\s+["']axios["']/);
  });
});

describe("FE-03 — Settings.jsx has no hardcoded URLs", () => {
  const filePath = resolve(CLIENT_SRC, "pages/settings/Settings.jsx");
  let source;
  beforeAll(() => { source = readFileSync(filePath, "utf-8"); });

  test("does not contain http://localhost:3000", () => {
    expect(source).not.toMatch(/http:\/\/localhost:3000/);
  });

  test("uses relative /api/ paths", () => {
    // At least one /api/ relative path should exist
    expect(source).toMatch(/["']\/api\//);
  });
});

describe("FE-03 — Portfolio.jsx has no hardcoded URLs", () => {
  const filePath = resolve(CLIENT_SRC, "pages/portfolio/Portfolio.jsx");
  let source;
  beforeAll(() => { source = readFileSync(filePath, "utf-8"); });

  test("does not contain http://localhost:3000", () => {
    expect(source).not.toMatch(/http:\/\/localhost:3000/);
  });
});

// ─── Allowed files still define API_BASE correctly ──────────────────────────

describe("FE-03 — API_BASE fallback is correct in allowed files", () => {
  for (const filePath of ALLOWED_FILES) {
    const relPath = filePath.replace(REPO_ROOT + "/", "");

    test(`${relPath} defines API_BASE with VITE_API_BASE env + localhost fallback`, () => {
      const source = readFileSync(filePath, "utf-8");
      expect(source).toMatch(/VITE_API_BASE/);
      expect(source).toMatch(/http:\/\/localhost:3000/);
    });
  }
});
