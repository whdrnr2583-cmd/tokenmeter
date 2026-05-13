-- Token Meter license + waitlist schema (Cloudflare D1).

CREATE TABLE IF NOT EXISTS waitlist (
  email TEXT PRIMARY KEY,
  source TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS licenses (
  key TEXT PRIMARY KEY,           -- e.g. tm_live_<32 hex>
  email TEXT NOT NULL,
  plan TEXT NOT NULL,             -- 'pro' | 'pro_plus' | 'team'
  status TEXT NOT NULL,           -- 'active' | 'canceled' | 'expired'
  polar_subscription_id TEXT,
  polar_customer_id TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER,             -- nullable for ongoing subscriptions
  last_verified_at INTEGER,
  device_fingerprint TEXT         -- optional, soft binding only
);

CREATE INDEX IF NOT EXISTS idx_licenses_email ON licenses(email);
CREATE INDEX IF NOT EXISTS idx_licenses_polar ON licenses(polar_subscription_id);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,            -- Polar event id
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
