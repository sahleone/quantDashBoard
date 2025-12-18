import mongoose from "mongoose";

/**
 * Ensures MongoDB connection is established
 * Reuses existing connection if already connected
 *
 * @param {string} databaseUrl - MongoDB connection string (optional, defaults to DATABASE_URL env var)
 * @returns {Promise<void>}
 */
export async function ensureDbConnection(databaseUrl = null) {
  // If already connected, return early
  if (mongoose.connection.readyState === 1) {
    return;
  }

  const dbUrl =
    databaseUrl ||
    process.env.DATABASE_URL ||
    (() => {
      throw new Error(
        "DATABASE_URL environment variable is required. Please set it in your .env file."
      );
    })();

  try {
    await mongoose.connect(dbUrl, {
      serverSelectionTimeoutMS: 60000, // 60 seconds
      connectTimeoutMS: 60000, // 60 seconds
      socketTimeoutMS: 120000, // 2 minutes
      maxPoolSize: 50, // Increase connection pool
      minPoolSize: 10,
      maxIdleTimeMS: 45000,
    });

    // Verify connection is ready
    await mongoose.connection.db.admin().ping();
  } catch (err) {
    console.error("Failed to connect to MongoDB:", err?.message || err);
    throw err;
  }
}

/**
 * Disconnects from MongoDB if connected
 *
 * @returns {Promise<void>}
 */
export async function disconnectDb() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.disconnect();
  }
}

/**
 * Gets the MongoDB database instance
 * Assumes connection is already established
 *
 * @returns {Object} MongoDB database instance
 */
export function getDb() {
  if (mongoose.connection.readyState !== 1) {
    throw new Error(
      "MongoDB connection not established. Call ensureDbConnection() first."
    );
  }
  return mongoose.connection.db;
}
