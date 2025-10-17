// config/environment.js
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the src directory
dotenv.config({ path: join(__dirname, "..", ".env") });

// Validate required environment variables
const requiredEnvVars = ["SNAPTRADE_CLIENT_ID", "SNAPTRADE_CONSUMER_SECRET"];

requiredEnvVars.forEach((varName) => {
  if (!process.env[varName]) {
    throw new Error(`Missing required environment variable: ${varName}`);
  }
});

// Export processed configuration
export const config = {
  snapTrade: {
    clientId: process.env.SNAPTRADE_CLIENT_ID,
    consumerSecret: process.env.SNAPTRADE_CONSUMER_SECRET,
  },
  server: {
    BackendPort: process.env.PORT || 3000,
    FrontendPort: process.env.FRONTEND_PORT || 5173,
  },
  jwt: {
    secret: process.env.JWT_SECRET || "default-jwt-secret-change-in-production",
    refreshSecret:
      process.env.JWT_REFRESH_SECRET ||
      "default-refresh-secret-change-in-production",
    expiresIn: process.env.EXPIRES_IN || "15m",
  },
  DATABASE_URL:
    process.env.DATABASE_URL || "mongodb://localhost:27017/quantDashboard",
};
