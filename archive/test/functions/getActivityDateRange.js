import { ensureDbConnection, getDb } from "../utils/dbConnection.js";
import { formatDateToYYYYMMDD } from "../utils/dateHelpers.js";

/**
 * Finds the minimum and maximum date of activities stored in the database
 *
 * @param {Object} opts - Options object
 * @param {string} opts.databaseUrl - MongoDB connection string (defaults to DATABASE_URL env var)
 * @param {string} opts.accountId - Optional accountId to filter by specific account
 * @returns {Promise<Object>} Object with minDate and maxDate
 */
export async function getActivityDateRange(opts = {}) {
  const { databaseUrl, accountId } = opts;

  await ensureDbConnection(databaseUrl);

  const db = getDb();
  const activitiesCollection = db.collection("snaptradeaccountactivities");

  try {
    const query = {};
    if (accountId) {
      query.accountId = accountId;
    }

    const pipeline = [
      { $match: query },
      {
        $project: {
          date: {
            $ifNull: ["$trade_date", "$date"],
          },
        },
      },
      {
        $match: {
          date: { $ne: null },
        },
      },
      {
        $group: {
          _id: null,
          minDate: { $min: "$date" },
          maxDate: { $max: "$date" },
        },
      },
    ];

    const result = await activitiesCollection.aggregate(pipeline).toArray();

    if (result.length === 0 || !result[0].minDate || !result[0].maxDate) {
      return {
        minDate: null,
        maxDate: null,
        minDateString: null,
        maxDateString: null,
        message: "No activities with valid dates found",
      };
    }

    const minDate = result[0].minDate;
    const maxDate = result[0].maxDate;

    return {
      minDate: minDate,
      maxDate: maxDate,
      minDateString: formatDateToYYYYMMDD(minDate),
      maxDateString: formatDateToYYYYMMDD(maxDate),
    };
  } catch (err) {
    console.error("Error fetching activity date range:", err?.message || err);
    throw err;
  }
}

