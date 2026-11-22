-- Layered Beauty booking schema
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookings (
  id           TEXT PRIMARY KEY,
  service      TEXT NOT NULL,
  start_ts     INTEGER NOT NULL,          -- UTC epoch ms
  end_ts       INTEGER NOT NULL,          -- UTC epoch ms
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled')),
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bookings_time ON bookings (start_ts, end_ts);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings (email);

CREATE TABLE IF NOT EXISTS blocks (
  id         TEXT PRIMARY KEY,
  start_ts   INTEGER NOT NULL,
  end_ts     INTEGER NOT NULL,
  reason     TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_blocks_time ON blocks (start_ts, end_ts);
