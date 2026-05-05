CREATE TABLE IF NOT EXISTS rate_limit_entries (
  key text NOT NULL,
  timestamp bigint NOT NULL
);
CREATE INDEX idx_rate_limit_key ON rate_limit_entries(key);

-- Cleanup function to prevent unbounded growth
CREATE OR REPLACE FUNCTION cleanup_rate_limits(max_age_ms bigint DEFAULT 60000)
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_entries WHERE timestamp < (extract(epoch from now()) * 1000 - max_age_ms);
END;
$$ LANGUAGE plpgsql;
