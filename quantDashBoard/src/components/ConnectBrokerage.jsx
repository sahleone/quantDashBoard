import React, { useState, useEffect } from 'react';
import { SnapTradeReact } from 'snaptrade-react';
import { useWindowMessage } from 'snaptrade-react/hooks/useWindowMessage';
import { Snaptrade } from 'snaptrade-typescript-sdk';

// Environment variables for SnapTrade—make sure these are set in your `.env`
const SNAPTRADE_CLIENT_ID = import.meta.env.VITE_SNAPTRADE_CLIENT_ID;
const SNAPTRADE_CONSUMER_KEY = import.meta.env.VITE_SNAPTRADE_CONSUMER_KEY;
const SNAPTRADE_USER_ID = import.meta.env.VITE_SNAPTRADE_USER_ID;
const SNAPTRADE_USER_SECRET = import.meta.env.VITE_SNAPTRADE_USER_SECRET;

// Initialize SnapTrade client for generating portal URLs
const snaptrade = new Snaptrade({
  clientId: SNAPTRADE_CLIENT_ID,
  consumerKey: SNAPTRADE_CONSUMER_KEY,
});

const ConnectBrokerage = () => {
 

  return (
    <div>
      <h1>Connect Brokerage</h1>
    </div>
  );
};

export default ConnectBrokerage;
