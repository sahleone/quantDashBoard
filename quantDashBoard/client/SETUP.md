# Setup Guide

## Required API Keys

This application requires API keys to function properly. Follow these steps to set up your environment:

### 1. Polygon.io API Key (Required for Stock Info)

1. Go to [Polygon.io](https://polygon.io/) and create a free account
2. Get your API key from the dashboard
3. Create a `.env` file in the project root with:
   ```
   VITE_POLYGON_API_KEY=your_polygon_api_key_here
   ```

### 2. SnapTrade API Keys (Optional for Brokerage Connections)

If you want to use the brokerage connection features:

1. Go to [SnapTrade](https://snaptrade.com/) and create an account
2. Get your API keys from the dashboard
3. Add these to your `.env` file:
   ```
   VITE_SNAPTRADE_CLIENT_ID=your_snaptrade_client_id_here
   VITE_SNAPTRADE_CONSUMER_KEY=your_snaptrade_consumer_key_here
   VITE_SNAPTRADE_USER_SECRET=your_snaptrade_user_secret_here
   VITE_SNAPTRADE_USER_ID=your_snaptrade_user_id_here
   ```

### 3. Install Dependencies

```bash
npm install
```

### 4. Start Development Server

```bash
npm run dev
```

## Troubleshooting

- If you see "Polygon API key is not configured" error, make sure your `.env` file exists and contains the correct API key
- The `.env` file should be in the project root (same level as `package.json`)
- Restart your development server after adding the `.env` file
- Make sure the `.env` file is not committed to git (it should be in `.gitignore`)

## Features

- **Stock Info**: Search and view stock information using Polygon.io API
- **Dashboard**: View charts and portfolio data
- **Settings**: Manage your profile and preferences
- **Brokerage Connection**: Connect your trading account (requires SnapTrade API keys)
