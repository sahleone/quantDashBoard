# Server Setup Guide

## Environment Variables

Create a `.env` file in the server directory with the following variables:

```env
# Server Configuration
PORT=3000

# Database Configuration
DATABASE_URL=mongodb://localhost:27017/quantDashboard

# SnapTrade Configuration
SNAPTRADE_CLIENT_ID=your_snaptrade_client_id_here
SNAPTRADE_CONSUMER_KEY=your_snaptrade_consumer_key_here
```

## Prerequisites

1. **MongoDB**: Make sure MongoDB is installed and running locally

   - Install MongoDB: https://docs.mongodb.com/manual/installation/
   - Start MongoDB service

2. **Node.js**: Ensure Node.js is installed (version 14 or higher recommended)

## Installation

1. Navigate to the server directory:

   ```bash
   cd server
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Create the `.env` file with your configuration

4. Start the server:
   ```bash
   npm start
   ```

## Troubleshooting

If you get a "DATABASE_URL undefined" error:

1. Make sure you have created the `.env` file
2. Ensure MongoDB is running
3. Check that the DATABASE_URL in your `.env` file is correct

For SnapTrade configuration:

1. Sign up for a SnapTrade account
2. Get your Client ID and Consumer Key from the SnapTrade dashboard
3. Add them to your `.env` file
