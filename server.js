const express = require('express');
const Redis = require('ioredis');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;
const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;
const REDIS_USERNAME = process.env.REDIS_USERNAME || undefined;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Redis connection
const redisOptions = {
  host: REDIS_HOST,
  port: REDIS_PORT,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    return Math.min(times * 100, 2000);
  }
};

if (REDIS_PASSWORD) redisOptions.password = REDIS_PASSWORD;
if (REDIS_USERNAME) redisOptions.username = REDIS_USERNAME;

const redis = new Redis(redisOptions);

redis.on('connect', () => {
  console.log(`✅ [Redis] Connected successfully to ${REDIS_HOST}:${REDIS_PORT}`);
});

redis.on('ready', () => {
  console.log(`⚡ [Redis] Ready to accept commands`);
});

redis.on('error', (err) => {
  console.error('❌ [Redis] Connection Error:', err.message);
});

/**
 * Health / Connection check
 */
app.get('/api/health', async (req, res) => {
  try {
    const ping = await redis.ping();
    const info = await redis.info('server');
    res.json({ status: 'ok', redis: ping, host: `${REDIS_HOST}:${REDIS_PORT}`, info });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      message: error.message, 
      hint: `Make sure Redis is running on ${REDIS_HOST}:${REDIS_PORT}` 
    });
  }
});

/**
 * POST /api/trade/buy
 * Simulates Buy Trade Execution:
 * 1. Appends trade execution event to Redis Stream (XADD)
 * 2. Updates position cache in Redis Hash (HSET)
 * 3. Tracks active account symbols in Redis Set (SADD)
 */
app.post('/api/trade/buy', async (req, res) => {
  try {
    const { account = 'ACC_001', symbol, quantity, price } = req.body;

    if (!symbol || !quantity || !price || quantity <= 0 || price <= 0) {
      return res.status(400).json({
        error: 'Invalid trade input. Please provide valid symbol, quantity (>0), and price (>0).'
      });
    }

    const cleanSymbol = symbol.toUpperCase().trim();
    const qty = parseFloat(quantity);
    const unitPrice = parseFloat(price);
    const tradeTimestamp = Date.now();
    const tradeId = `TRD_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // --- STEP 1: Append trade event to Redis Stream (XADD) ---
    const streamKey = 'stream:trades';
    const streamEntryId = await redis.xadd(
      streamKey,
      '*',
      'tradeId', tradeId,
      'event', 'TRADE_EXEC',
      'side', 'BUY',
      'account', account,
      'symbol', cleanSymbol,
      'quantity', qty.toString(),
      'price', unitPrice.toString(),
      'timestamp', tradeTimestamp.toString()
    );

    // --- STEP 2: Read current position cache from Redis Hash ---
    const positionKey = `position:${account}:${cleanSymbol}`;
    const existingPosition = await redis.hgetall(positionKey);

    let currentQty = 0;
    let currentAvgPrice = 0;
    let totalInvested = 0;

    if (existingPosition && existingPosition.shares) {
      currentQty = parseFloat(existingPosition.shares) || 0;
      currentAvgPrice = parseFloat(existingPosition.avg_price) || 0;
      totalInvested = currentQty * currentAvgPrice;
    }

    // --- STEP 3: Compute updated Position (Weighted Average Price) ---
    const newQty = currentQty + qty;
    const newTotalInvested = totalInvested + (qty * unitPrice);
    const newAvgPrice = newTotalInvested / newQty;

    // --- STEP 4: Update Redis Cache (Hash & Set) via Pipeline ---
    const pipeline = redis.pipeline();
    
    // Hash stores real-time aggregated position details
    pipeline.hset(positionKey, {
      symbol: cleanSymbol,
      account: account,
      shares: newQty.toFixed(4),
      avg_price: newAvgPrice.toFixed(4),
      total_invested: newTotalInvested.toFixed(2),
      last_trade_id: tradeId,
      last_updated: new Date(tradeTimestamp).toISOString()
    });

    // Set keeps track of all active symbols for this account
    pipeline.sadd(`account:${account}:symbols`, cleanSymbol);
    // Global set tracking all accounts
    pipeline.sadd('accounts:all', account);

    await pipeline.exec();

    res.json({
      success: true,
      trade: {
        tradeId,
        streamEntryId,
        account,
        symbol: cleanSymbol,
        side: 'BUY',
        quantity: qty,
        price: unitPrice,
        timestamp: tradeTimestamp
      },
      updatedPosition: {
        symbol: cleanSymbol,
        shares: newQty,
        avgPrice: newAvgPrice,
        totalInvested: newTotalInvested,
        lastUpdated: new Date(tradeTimestamp).toISOString()
      }
    });
  } catch (error) {
    console.error('Error executing buy trade:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/positions
 * Retrieves all cached positions across ALL accounts from Redis
 */
app.get('/api/positions', async (req, res) => {
  try {
    const accounts = await redis.smembers('accounts:all');
    if (!accounts || accounts.length === 0) {
      // Fallback: Check if there is any account:* key
      const keys = await redis.keys('position:*:*');
      const positions = [];
      for (const key of keys) {
        const data = await redis.hgetall(key);
        if (data && data.symbol) positions.push(data);
      }
      return res.json({ positions });
    }

    const positions = [];
    for (const acc of accounts) {
      const symbols = await redis.smembers(`account:${acc}:symbols`);
      if (symbols && symbols.length > 0) {
        const pipeline = redis.pipeline();
        symbols.forEach(sym => pipeline.hgetall(`position:${acc}:${sym}`));
        const results = await pipeline.exec();
        results.forEach(([err, data]) => {
          if (!err && data && data.symbol) positions.push(data);
        });
      }
    }

    res.json({ positions });
  } catch (error) {
    console.error('Error fetching all positions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/positions/:account
 * Retrieves all cached positions for a specific account from Redis Hashes
 */
app.get('/api/positions/:account', async (req, res) => {
  try {
    const account = req.params.account;
    const symbols = await redis.smembers(`account:${account}:symbols`);

    if (!symbols || symbols.length === 0) {
      return res.json({ account, positions: [] });
    }

    // Fetch all position hashes in parallel
    const pipeline = redis.pipeline();
    symbols.forEach(sym => {
      pipeline.hgetall(`position:${account}:${sym}`);
    });

    const results = await pipeline.exec();
    const positions = results
      .map(([err, data]) => (!err && data && data.symbol ? data : null))
      .filter(Boolean);

    res.json({ account, positions });
  } catch (error) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stream/trades
 * Reads back the Redis stream entries using XRANGE (Replay mechanism)
 */
app.get('/api/stream/trades', async (req, res) => {
  try {
    const streamKey = 'stream:trades';
    // XRANGE stream:trades - + (reads all stream entries)
    const streamEntries = await redis.xrange(streamKey, '-', '+');

    // Format Redis stream tuples [[id, [k1, v1, k2, v2]], ...] to JSON
    const parsedTrades = streamEntries.map(([id, fields]) => {
      const entry = { streamId: id };
      for (let i = 0; i < fields.length; i += 2) {
        entry[fields[i]] = fields[i + 1];
      }
      return entry;
    });

    res.json({ total: parsedTrades.length, trades: parsedTrades.reverse() });
  } catch (error) {
    console.error('Error reading stream:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/reset
 * Clears trade stream and position keys for testing
 */
app.post('/api/reset', async (req, res) => {
  try {
    const streamKey = 'stream:trades';
    await redis.del(streamKey);

    const keys = await redis.keys('position:*');
    const accountKeys = await redis.keys('account:*');
    const allKeys = [...keys, ...accountKeys];

    if (allKeys.length > 0) {
      await redis.del(...allKeys);
    }

    res.json({ success: true, message: 'Redis stream and position cache cleared.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n=================================================`);
  console.log(`🚀 OMS Redis Buy Trade POC running at:`);
  console.log(`👉 Web UI:       http://localhost:${PORT}`);
  console.log(`👉 Redis Host:   ${REDIS_HOST}:${REDIS_PORT}`);
  console.log(`👉 Redis Stream: stream:trades`);
  console.log(`=================================================\n`);
});
