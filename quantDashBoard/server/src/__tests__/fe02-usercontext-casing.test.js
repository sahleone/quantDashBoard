/**
 * Tests for FE-02: Fix UserContext filename casing
 *
 * Verifies that:
 * - UserContext.js (capital C) exists in client/src/context/
 * - Usercontext.js (lowercase c) does NOT exist as a separate file
 * - All importing files reference the correct casing
 *
 * Run:
 *   node --experimental-vm-modules node_modules/.bin/jest \
 *     --config server/src/__tests__/fe02.jest.config.js
 */

import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = resolve(__dirname, "../../..");
const CONTEXT_DIR = resolve(REPO_ROOT, "client/src/context");

describe("FE-02 — UserContext.js filename casing", () => {

  test("UserContext.js (capital C) exists in client/src/context/", () => {
    const target = resolve(CONTEXT_DIR, "UserContext.js");
    expect(existsSync(target)).toBe(true);
  });

  test("Usercontext.js (lowercase c) does NOT exist as a separate file", () => {
    const files = readdirSync(CONTEXT_DIR);
    const contextFiles = files.filter((f) =>
      f.toLowerCase() === "usercontext.js"
    );
    // Exactly one file matching (case-insensitive), and it must be camelCase
    expect(contextFiles).toHaveLength(1);
    expect(contextFiles[0]).toBe("UserContext.js");
  });

  test("UserContext.js exports a React context as default", async () => {
    const source = readFileSync(resolve(CONTEXT_DIR, "UserContext.js"), "utf-8");
    expect(source).toMatch(/createContext/);
    expect(source).toMatch(/export\s+default\s+UserContext/);
  });
});

describe("FE-02 — all imports reference UserContext (capital C)", () => {

  const importingFiles = [
    "client/src/App.jsx",
    "client/src/pages/Dashboard.jsx",
    "client/src/pages/settings/Settings.jsx",
    "client/src/pages/auth/Signup.jsx",
    "client/src/components/login/Login.jsx",
    "client/src/components/connectBrokerage/ConnectBrokerage.jsx",
    "client/src/components/refreshButton/refreshButton.jsx",
    "client/src/utils/ProtectedRoutes.jsx",
    "client/src/Layouts/RootLayout.jsx",
  ];

  for (const relPath of importingFiles) {
    const fileName = relPath.split("/").pop();

    test(`${fileName} imports from context/UserContext (capital C)`, () => {
      const filePath = resolve(REPO_ROOT, relPath);
      if (!existsSync(filePath)) {
        // File may have been moved/renamed — skip gracefully
        console.warn(`Skipping: ${relPath} not found`);
        return;
      }
      const content = readFileSync(filePath, "utf-8");

      // Must import UserContext (capital C)
      if (content.includes("context/User")) {
        expect(content).toMatch(/context\/UserContext/);
        // Must NOT reference lowercase variant
        expect(content).not.toMatch(/context\/Usercontext[^A-Z]/);
        expect(content).not.toMatch(/context\/Usercontext[/"']/)
      }
    });
  }
});
