import { useState } from 'react';
import { SnapTradeReact } from 'snaptrade-react';
import { Snaptrade } from "snaptrade-typescript-sdk";


const SNAPTRADE_CLIENT_ID = import.meta.env.VITE_SNAPTRADE_CLIENT_ID;
const SNAPTRADE_CONSUMER_KEY = import.meta.env.VITE_SNAPTRADE_CONSUMER_KEY;
const SNAPTRADE_USER_SECRET = import.meta.env.VITE_SNAPTRADE_USER_SECRET;
const SNAPTRADE_USER_ID = import.meta.env.VITE_SNAPTRADE_USER_ID;

const snaptrade = new Snaptrade({
  clientId: SNAPTRADE_CLIENT_ID,
  consumerKey: SNAPTRADE_CONSUMER_KEY,
});



const getRedirectURI = async () => {
  const response = await snaptrade.login({
    userId: SNAPTRADE_USER_ID,
    userSecret: SNAPTRADE_USER_SECRET,
  });

  if (response.status === "success") {
    return response.data.redirectLink;
  } 
};

const ConnectBrokerage = () => {
  const [open, setOpen] = useState(false);
  const [redirectLink, setRedirectLink] = useState(null);

  const connectionProcess = async () => {
    // call "https://api.snaptrade.com/api/v1/snapTrade/login" to generate a redirect link
    const link = await getRedirectURI();

    // update the state with the generated link
    setRedirectLink(link);

    // update the "open" state to show the modal
    setOpen(true);
  };

  return (
    <div>
      {/* your Connect button */}
      <button onClick={connectionProcess}>Connect</button>
      {redirectLink && (
        <SnapTradeReact
          loginLink={redirectLink}
          isOpen={open}
          close={() => setOpen(false)}
        />
      )}
    </div>
  );
};

export default ConnectBrokerage;