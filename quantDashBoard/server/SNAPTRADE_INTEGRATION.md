# SnapTrade Integration Documentation

## Overview

This document describes the comprehensive SnapTrade integration that has been implemented to connect brokerage accounts with MongoDB database storage. The integration provides both real-time API access and persistent data storage for portfolio management.

## Architecture

The integration consists of several key components:

1. **Models** - MongoDB schemas for storing SnapTrade data
2. **Controllers** - Business logic for integrating SnapTrade API with MongoDB
3. **Routes** - REST API endpoints for accessing SnapTrade functionality
4. **Clients** - SnapTrade API service wrappers

## Models

### Account Model (`models/Account.js`)

Stores comprehensive account information including:

- User association
- Connection reference
- Account details (name, type, currency)
- Brokerage information
- Sync status and timestamps

### Connection Model (`models/Connection.js`)

Manages brokerage connections with:

- User association
- Brokerage details
- Authorization status
- Connection metadata

### Existing Models Enhanced

- **AccountPositions** - Stock positions with market data
- **AccountBalances** - Account balance information
- **AccountDetails** - Detailed account information
- **Metrics** - Performance metrics and analytics

## Controllers

### SnapTrade Controller (`controllers/snapTradeController.js`)

Comprehensive controller providing:

#### User Management

- `createSnapTradeUser()` - Create SnapTrade user and sync with MongoDB
- `deleteSnapTradeUser()` - Delete user and clean up all associated data

#### Data Synchronization

- `syncUserConnections()` - Sync connections from SnapTrade to MongoDB
- `syncUserAccounts()` - Sync accounts from SnapTrade to MongoDB
- `syncAccountPositions()` - Sync positions from SnapTrade to MongoDB
- `syncAccountBalances()` - Sync balances from SnapTrade to MongoDB

#### Portfolio Management

- `getUserPortfolio()` - Get complete portfolio from MongoDB
- `generateConnectionPortal()` - Generate brokerage connection URL

## Routes

### SnapTrade Routes (`routes/snapTrade.js`)

Comprehensive API endpoints:

#### User Management

- `POST /snapTrade/users/create` - Create SnapTrade user
- `POST /snapTrade/users/connection-portal` - Generate connection portal
- `DELETE /snapTrade/users/:userId` - Delete SnapTrade user

#### Data Synchronization

- `GET /snapTrade/sync/connections` - Sync connections
- `GET /snapTrade/sync/accounts` - Sync accounts
- `GET /snapTrade/sync/positions` - Sync positions
- `GET /snapTrade/sync/balances` - Sync balances
- `POST /snapTrade/sync/all` - Bulk sync all data

#### Real-time API Access

- `GET /snapTrade/api/connections` - Direct SnapTrade connections
- `GET /snapTrade/api/accounts` - Direct SnapTrade accounts
- `GET /snapTrade/api/positions` - Direct SnapTrade positions
- `GET /snapTrade/api/balances` - Direct SnapTrade balances
- `GET /snapTrade/api/activities` - Direct SnapTrade activities

#### Portfolio Data

- `GET /snapTrade/portfolio/:userId` - Complete portfolio from MongoDB

### Enhanced Existing Routes

#### Accounts Routes (`routes/accounts.js`)

- `GET /accounts/mongo/:userId` - Get accounts from MongoDB
- `GET /accounts/mongo/:userId/positions` - Get positions from MongoDB
- `GET /accounts/mongo/:userId/balances` - Get balances from MongoDB
- `GET /accounts/mongo/:userId/summary` - Get account summary

#### Connections Routes (`routes/connections.js`)

- `GET /connections/mongo/:userId` - Get connections from MongoDB
- `POST /connections/save` - Save connection to MongoDB
- `PUT /connections/:connectionId/status` - Update connection status
- `DELETE /connections/:connectionId` - Delete connection

#### Users Routes (`routes/Snapusers.js`)

- `GET /users/mongo/:userId` - Get user from MongoDB
- `PUT /users/mongo/:userId` - Update user in MongoDB
- `GET /users/mongo/:userId/snapTrade-status` - Check SnapTrade status

## Usage Examples

### 1. Create SnapTrade User

```javascript
POST /snapTrade/users/create
{
  "userId": "user-uuid",
  "email": "user@example.com"
}
```

### 2. Generate Connection Portal

```javascript
POST /snapTrade/users/connection-portal
{
  "userId": "user-uuid",
  "userSecret": "user-secret",
  "broker": "ROBINHOOD"
}
```

### 3. Sync All Data

```javascript
POST /snapTrade/sync/all
{
  "userId": "user-uuid",
  "userSecret": "user-secret"
}
```

### 4. Get Portfolio Summary

```javascript
GET / accounts / mongo / user - uuid / summary;
```

### 5. Get Real-time Positions

```javascript
GET /snapTrade/api/positions?userId=user-uuid&userSecret=user-secret&accountId=account-id
```

## Data Flow

1. **User Registration**: User signs up → SnapTrade user created → Credentials stored in MongoDB
2. **Brokerage Connection**: Connection portal generated → User connects brokerage → Connection synced to MongoDB
3. **Data Synchronization**: Regular sync operations pull data from SnapTrade → Store in MongoDB
4. **Portfolio Access**: Application reads from MongoDB for fast access → Real-time data available via direct API

## Security Features

- All routes protected with authentication middleware
- User secrets stored securely in MongoDB
- Connection status tracking and validation
- Soft deletion for data integrity

## Performance Optimizations

- MongoDB indexes for efficient querying
- Bulk operations for data synchronization
- Caching of frequently accessed data
- Pagination support for large datasets

## Error Handling

- Comprehensive error logging
- Graceful fallbacks for API failures
- Data validation and sanitization
- User-friendly error messages

## Future Enhancements

- Automated data synchronization scheduling
- Real-time WebSocket updates
- Advanced portfolio analytics
- Multi-brokerage support
- Data export capabilities

## Dependencies

- SnapTrade TypeScript SDK
- MongoDB with Mongoose
- Express.js for API routes
- JWT authentication
- UUID generation

## Environment Variables

Ensure these are set in your `.env` file:

- `SNAPTRADE_CLIENT_ID`
- `SNAPTRADE_CONSUMER_SECRET`
- `DATABASE_URL`
- `JWT_SECRET`

This integration provides a robust foundation for brokerage account management with both real-time access and persistent storage capabilities.
