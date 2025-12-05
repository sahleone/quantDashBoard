import { disconnectDb } from "./dbConnection.js";

/**
 * Wraps an async function with error handling and database cleanup
 *
 * @param {Function} fn - Async function to wrap
 * @param {Object} options - Options for error handling
 * @param {boolean} options.disconnectOnError - Whether to disconnect DB on error (default: true)
 * @param {boolean} options.exitOnError - Whether to exit process on error (default: true)
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, options = {}) {
  const { disconnectOnError = true, exitOnError = true } = options;

  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      console.error("\nError:", error.message);
      if (error.stack) {
        console.error(error.stack);
      }

      if (disconnectOnError) {
        try {
          await disconnectDb();
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
      }

      if (exitOnError) {
        process.exit(1);
      }

      throw error;
    }
  };
}

/**
 * Handles errors and disconnects from database
 * Use this at the end of main execution functions
 *
 * @param {Error} error - Error object
 * @param {boolean} exit - Whether to exit process (default: true)
 */
export async function handleError(error, exit = true) {
  console.error("\nError:", error.message);
  if (error.stack) {
    console.error(error.stack);
  }

  try {
    await disconnectDb();
  } catch (disconnectError) {
    // Ignore disconnect errors
  }

  if (exit) {
    process.exit(1);
  }
}

