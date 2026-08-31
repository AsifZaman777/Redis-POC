# Redis Buy Trade & Caching POC

A lightweight Proof-of-Concept exploring **Redis Caching** and **Redis Streams** for an Order Management System (OMS) Buy Trade flow.

---

## 🏗️ Architecture & Redis Operations

This POC models the primary event-sourcing and caching flow from the sequence diagram:

1. **Trade Event Ingestion (`XADD`)**:
   - Every buy trade is appended as an immutable event to the Redis Stream `stream:trades`.
   - Redis assigns a monotonic millisecond-based ID (e.g. `1725100000000-0`).
2. **Real-time Position Caching (`HSET`)**:
   - Aggregated position metrics (Total Shares, Weighted Average Buy Price, Total Invested, Last Updated) are updated in a Redis Hash at `position:<account>:<symbol>`.
3. **Symbol Tracking (`SADD`)**:
   - Active account symbols are maintained in a Redis Set at `account:<account>:symbols`.
4. **State Replay / Querying (`XRANGE` & `HGETALL`)**:
   - `HGETALL` quickly retrieves the current position snapshot for zero-latency lookups.
   - `XRANGE` replays the stream for audit history, reconciliation, and service restart recovery.

---

## 🚀 Quick Start Guide

### Step 1: Run Redis in Docker (Choose Option A or B)

#### **Option A: Using Docker Compose (Includes Redis + RedisInsight UI)**
```bash
docker compose up -d
```
* **Redis Port**: `localhost:6379`
* **RedisInsight Web GUI**: [http://localhost:5540](http://localhost:5540)

#### **Option B: Standalone Docker Run**
```bash
docker run -d --name redis-poc -p 6379:6379 redis:7-alpine
```

---

### Step 2: Run the Node.js Application

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. Open your browser:
   👉 **[http://localhost:3000](http://localhost:3000)**

---

## 🧪 Testing the POC

1. **Place Buy Orders**: Select a symbol (e.g., AAPL @ $185.50, quantity 10) and click **Execute Buy Order**.
2. **Observe Redis Cache**: Look at the **Live Positions Cache** table to see real-time weighted average price calculations.
3. **Observe Redis Streams**: Watch the **Redis Stream Event Log** update with each `XADD` event.
4. **Reset State**: Click **Reset State** in the top right to clean up Redis test keys.
