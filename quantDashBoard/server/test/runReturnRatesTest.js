#!/usr/bin/env node
/*
  Small test runner to reproduce SnapTrade SDK errors for getUserAccountReturnRates

  Usage:
    SNAPTRADE_USER_ID=<userId> \
    SNAPTRADE_USER_SECRET=<userSecret> \
    SNAPTRADE_ACCOUNT_ID=<accountId> \
    node test/runReturnRatesTest.js

  The script imports the existing AccountServiceClientService so it will use the
  same SnapTrade client configuration as the server. It prints the full SDK
  response on success or the detailed error.response when the SDK throws.
*/

import AccountServiceClientService from "../src/clients/accountClient.js";

const {
  SNAPTRADE_USER_ID,
  SNAPTRADE_USER_SECRET,
  SNAPTRADE_ACCOUNT_ID,
  SNAPTRADE_CLIENT_ID,
  SNAPTRADE_CONSUMER_SECRET,
} = process.env;

if (!SNAPTRADE_USER_ID || !SNAPTRADE_USER_SECRET) {
  console.error(
    "Missing SNAPTRADE_USER_ID or SNAPTRADE_USER_SECRET environment variables."
  );
  console.error(
    "Example: SNAPTRADE_USER_ID=uid SNAPTRADE_USER_SECRET=secret SNAPTRADE_ACCOUNT_ID=acct node test/runReturnRatesTest.js"
  );
  process.exit(1);
}

const accountService = new AccountServiceClientService();

async function run() {
  try {
    console.log("Running getUserAccountReturnRates with:");
    console.log({
      userId: SNAPTRADE_USER_ID,
      accountId: SNAPTRADE_ACCOUNT_ID || "<none-specified>",
      clientId: SNAPTRADE_CLIENT_ID ? "present" : "missing",
      consumerSecret: SNAPTRADE_CONSUMER_SECRET ? "present" : "missing",
    });

    const result = await accountService.getUserAccountReturnRates(
      SNAPTRADE_USER_ID,
      SNAPTRADE_USER_SECRET,
      SNAPTRADE_ACCOUNT_ID
    );

    console.log("SDK call successful. Full response:");
    console.log(JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (error) {
    console.error("\nSnapTrade SDK call failed. Detailed error follows:");
    console.error("message:", error?.message);
    if (error?.response) {
      console.error("status:", error.response.status);
      console.error(
        "headers:",
        JSON.stringify(error.response.headers || {}, null, 2)
      );
      console.error("data:", JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("error object:", error);
    }
    process.exit(2);
  }
}

run();
