Here is the complete reference of **all required `redis-cli` commands** used in this project, categorized by operation:

---

### 1. Connecting to Redis CLI

```bash
# Default local connection (port 6379)
redis-cli

# If your Redis requires a password
redis-cli -a your_password

# Or with custom host & port
redis-cli -h 127.0.0.1 -p 6379
```

---

### 2. Stream Commands (`stream:trades`)

#### Add (Insert) a Trade Event

```redis
XADD stream:trades * tradeId TRD_001 event TRADE_EXEC side BUY account ACC_001 symbol GP quantity 100 price 285.50 timestamp 1725250000000
```

#### Read All Trades in the Stream

```redis
XRANGE stream:trades - +
```

> `-` means the beginning of the stream, `+` means the end of the stream.

#### Read Last N Trades

```redis
# Reads the last 5 trades in reverse order (newest first)
XREVRANGE stream:trades + - COUNT 5
```

#### Check Stream Length (Total Trades Count)

```redis
XLEN stream:trades
```

---

### 3. Hash Commands (`position:<account>:<symbol>`)

#### Insert / Update a Position

```redis
HSET position:ACC_001:GP symbol GP account ACC_001 shares 100 avg_price 285.50 total_invested 28550.00 last_trade_id TRD_001 last_updated "2026-09-02T05:15:00.000Z"
```

#### Read All Fields of a Specific Position

```redis
HGETALL position:ACC_001:GP
```

#### Read Specific Fields Only

```redis
# Get only shares and average price
HMGET position:ACC_001:GP shares avg_price
```

#### Check if a Position Exists

```redis
EXISTS position:ACC_001:GP
```

---

### 4. Set Commands (`accounts:all` & `account:<account>:symbols`)

#### Add Account to All Accounts Set

```redis
SADD accounts:all ACC_001
SADD accounts:all ACC_002
```

#### Add Symbol to Account's Symbols Set

```redis
SADD account:ACC_001:symbols GP
SADD account:ACC_001:symbols BATBC
```

#### View All Accounts

```redis
SMEMBERS accounts:all
```

#### View All Symbols for a Specific Account

```redis
SMEMBERS account:ACC_001:symbols
```

#### Check if Account Already Owns a Symbol

```redis
# Returns 1 if true, 0 if false
SISMEMBER account:ACC_001:symbols GP
```

#### Count How Many Symbols an Account Holds

```redis
SCARD account:ACC_001:symbols
```

---

### 5. Inspection & Debugging Commands

#### See All Keys (Testing/POC only — never use in production)

```redis
KEYS *
KEYS position:*
KEYS account:*
```

#### Check the Data Type of a Key

```redis
TYPE stream:trades
# Returns: stream

TYPE position:ACC_001:GP
# Returns: hash

TYPE accounts:all
# Returns: set
```

#### Check Remaining Time-to-Live (TTL)

```redis
TTL position:ACC_001:GP
# Returns: -1 (persistent, no expiration set)
```

#### Test Server Ping

```redis
PING
# Returns: PONG
```

---

### 6. Cleanup / Reset Commands (Matches `/api/reset` in [server.js:262](file:///e:/Testing/Redis-POC/server.js#L262))

#### Delete Specific Keys

```redis
DEL stream:trades
DEL position:ACC_001:GP
DEL account:ACC_001:symbols
DEL accounts:all
```

#### Flush Entire Current Database (Wipes everything)

```redis
FLUSHDB
```

---

### Summary Cheatsheet

| Task                          | CLI Command                                         |
| :---------------------------- | :-------------------------------------------------- |
| **Insert trade log**          | `XADD stream:trades * key value ...`                |
| **Read trade log**            | `XRANGE stream:trades - +`                          |
| **Save position**             | `HSET position:ACC_001:GP symbol GP shares 100 ...` |
| **Read position**             | `HGETALL position:ACC_001:GP`                       |
| **Index an account**          | `SADD accounts:all ACC_001`                         |
| **Index an account's symbol** | `SADD account:ACC_001:symbols GP`                   |
| **List indexed accounts**     | `SMEMBERS accounts:all`                             |
| **List an account's symbols** | `SMEMBERS account:ACC_001:symbols`                  |
| **Delete key(s)**             | `DEL key1 key2`                                     |
