import { Snaptrade } from "snaptrade-typescript-sdk";
import dotenv from "dotenv";
dotenv.config();

const snaptrade = new Snaptrade({
  clientId: process.env.SNAPTRADE_CLIENT_ID,
  consumerKey: process.env.SNAPTRADE_CONSUMER_KEY,

});
const broker = "ROBINHOOD";

// const response =
//   await snaptrade.authentication.registerSnapTradeUser(
//     { userId: "snaptrade-user-123" },
//   );
// console.log(response.data);

//  Connection Portal

// const response =
//   await snaptrade.authentication.loginSnapTradeUser(
//     {
//       userId:  "snaptrade-user-123",
//       userSecret:process.env.SNAPTRADE_USER_SECRET,
//       broker: broker,
//       immediateRedirect: true,
//       customRedirect: "https://snaptrade.com",
//     //   reconnect:
//     //     "8b5f262d-4bb9-365d-888a-202bd3b15fa1",
//       connectionPortalVersion: "v4",
//     },
//   );
// console.log(response.data);

// List accounts

// const response =
//   await snaptrade.accountInformation.listUserAccounts(
//     {
//       userId: "snaptrade-user-123",
//       userSecret:
//         process.env.SNAPTRADE_USER_SECRET,
//     },
//   );
// console.log(response.data);

// Get account details
// const response =
//   await snaptrade.accountInformation.getUserAccountDetails(
//     {
//       accountId:
//          'f582ae0b-32d9-4adb-b139-b6fc2cfca1f6',
//       userId: "snaptrade-user-123",
//       userSecret:
//         process.env.SNAPTRADE_USER_SECRET,
//     },
//   );
// console.log(response.data);

// Get account holdings
const response =
  await snaptrade.accountInformation.getUserAccountPositions(
    {
      accountId:
            'f582ae0b-32d9-4adb-b139-b6fc2cfca1f6',
      userId: "snaptrade-user-123",
      userSecret:
        process.env.SNAPTRADE_USER_SECRET,
    },
  );
// console.log(response.data);
console.log(JSON.stringify(response.data, null, 2));





