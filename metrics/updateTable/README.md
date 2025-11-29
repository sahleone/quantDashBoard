# updateActivitiesTable

This script (`updateActivitiesTable.js`) contains the `updateAccountActivitiesTable` function which fetches activities from SnapTrade and upserts them into the `AccountActivities` collection.

## Usage

The script can be run directly from the repository root:

### Run bulk update (all users)

```bash
node metrics/updateTable/updateActivitiesTable.js
```

This will:

- Connect to MongoDB (using `DATABASE_URL` environment variable or the default connection string)
- Iterate through all users in the `Users` collection
- For each user, fetch activities for all their accounts from SnapTrade
- Upsert activities into the `AccountActivities` collection

### Programmatic usage

The script exports `updateAccountActivitiesTable(opts)` which can be imported and called programmatically:

```javascript
import { updateAccountActivitiesTable } from "./metrics/updateTable/updateActivitiesTable.js";

// Bulk mode (all users)
await updateAccountActivitiesTable();

// Single user mode
await updateAccountActivitiesTable({
  userId: "USER_ID",
  userSecret: "USER_SECRET", // optional, will be looked up if not provided
});

// Custom database URL
await updateAccountActivitiesTable({
  databaseUrl: "mongodb://localhost:27017/quantDashBoard",
});

// Custom activity types
await updateAccountActivitiesTable({
  activityTypes: "BUY,SELL,DIVIDEND",
});
```

## Options

The `updateAccountActivitiesTable` function accepts the following options:

- `databaseUrl`: MongoDB connection string (defaults to `process.env.DATABASE_URL` or a hardcoded fallback)
- `activityTypes`: Comma-separated list of activity types to request (defaults to: `BUY,SELL,DIVIDEND,CONTRIBUTION,WITHDRAWAL,REI,STOCK_DIVIDEND,INTEREST,FEE,OPTIONEXPIRATION,OPTIONASSIGNMENT,OPTIONEXERCISE,TRANSFER`)
- `userId`: Optional string to process only a specific user's accounts
- `userSecret`: Optional string to use as the SnapTrade userSecret for the specified userId (if not provided, will be looked up from the `Users` collection)

## Behavior

- **Connection**: The script automatically connects to MongoDB if not already connected, with connection testing via ping and direct queries
- **Incremental updates**: For each account, the script determines the last known activity date (from `trade_date` or `date` fields) and only requests activities from that date onward
- **Deduplication**: Activities are upserted by `accountId` + `activityId`, preventing duplicates
- **Bulk mode**: When no `userId` is provided, the script iterates all users and uses each user's `userSecret` from the `Users` collection
- **Error handling**: Errors are collected in a summary object and the script continues processing other accounts

## Return Value

The function returns a summary object:

```javascript
{
  totalAccounts: number,    // Total accounts processed
  processed: number,        // Successfully processed accounts
  skipped: number,          // Users skipped (no userSecret)
  upsertedDocs: number,     // Total activities upserted/modified
  errors: [                 // Array of error objects
    { accountId: string, error: string },
    { userId: string, error: string }
  ]
}
```

## Notes

- The project uses ES modules (import/export). The script will work if Node.js detects ES module syntax, but you may see a warning if `"type": "module"` is not set in `package.json`
- The script uses direct MongoDB collection queries instead of Mongoose models to avoid connection timeout issues
- In bulk mode, users without a `userSecret` will be skipped with a warning
- The script automatically disconnects from MongoDB when finished

## Troubleshooting

- If you get `Cannot use import statement outside a module`, add `"type": "module"` to the root `package.json`
- Connection timeouts: The script includes connection testing and uses direct MongoDB queries to avoid Mongoose model buffering issues
- SnapTrade API errors: Check that `userSecret` values are valid and accounts are properly connected in SnapTrade
