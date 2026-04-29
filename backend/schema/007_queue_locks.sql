-- Queue locks: tracks which office user claimed a Raynet event for processing.
-- Keyed by raynet_event_id (the queue identity), independent of local orders.
CREATE TABLE IF NOT EXISTS queue_locks (
  raynet_event_id INT PRIMARY KEY,
  claimed_by VARCHAR NOT NULL,
  claimed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
