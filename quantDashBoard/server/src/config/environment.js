// config/environment.js
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from common locations to be resilient in local setups.
// Order: process.cwd() (default), src/.env, parent (server)/.env.
dotenv.config();
// Try src/.env and server/.env (no-op if file not present)
dotenv.config({ path: join(__dirname, ".env") });
dotenv.config({ path: join(__dirname, "..", ".env") });

if (
  !process.env.SNAPTRADE_CONSUMER_KEY &&
  process.env.SNAPTRADE_CONSUMER_SECRET
) {
  process.env.SNAPTRADE_CONSUMER_KEY = process.env.SNAPTRADE_CONSUMER_SECRET;
}

// Validate required environment variables
// Require critical values that the server must have to start.
// Add JWT_SECRET here so we fail fast if JWT signing secret is missing.
const requiredEnvVars = [
  "SNAPTRADE_CLIENT_ID",
  "SNAPTRADE_CONSUMER_KEY",
  "JWT_SECRET",
  "JWT_REFRESH_SECRET",
];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

// Export processed configuration (trim values to avoid leading/trailing spaces)
export const config = {
  snapTrade: {
    clientId: process.env.SNAPTRADE_CLIENT_ID,
    consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,
  },
  server: {
    BackendPort: process.env.PORT || 3000,
    FrontendPort: process.env.FRONTEND_PORT || 5173,
  },
  jwt: {
    // Trim values to avoid accidental leading/trailing spaces from .env
    secret: process.env.JWT_SECRET?.trim(),
    refreshSecret: process.env.JWT_REFRESH_SECRET?.trim(),
    expiresIn: process.env.EXPIRES_IN || process.env.JWT_EXPIRES_IN || "15m",
  },
  DATABASE_URL:
    process.env.DATABASE_URL || "mongodb://localhost:27017/quantDashboard",
  // MASSIVE (formerly Polygon) API key. Server-side key is `MASSIVE_API_KEY`.
  MASSIVE_API_KEY:
    process.env.MASSIVE_API_KEY || process.env.VITE_MASSIVE_API_KEY || "",
  // Alpha Vantage API key (for ticker time series and company overview)
  ALPHA_VANTAGE_API_KEY:
    process.env.ALPHA_VANTAGE_API_KEY ||
    process.env.VITE_ALPHA_VANTAGE_API_KEY ||
    "",
};
