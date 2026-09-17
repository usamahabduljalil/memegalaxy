CREATE TABLE IF NOT EXISTS profiles (
  user_id text PRIMARY KEY, wallet text NOT NULL UNIQUE, name varchar(24) NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS epochs (
  id bigint PRIMARY KEY, status text NOT NULL, secret text NOT NULL, commitment text NOT NULL,
  seed text, deadline bigint NOT NULL, match_deadline bigint, pool numeric(30,0) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS registrations (
  epoch_id bigint REFERENCES epochs(id), wallet text NOT NULL, user_id text NOT NULL, deposit numeric(78,0) NOT NULL,
  active boolean NOT NULL DEFAULT true, arena_id bigint, PRIMARY KEY(epoch_id,wallet)
);
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS payment_checked_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS one_user_per_epoch ON registrations(epoch_id,user_id) WHERE active;
CREATE TABLE IF NOT EXISTS arenas (
  id bigserial PRIMARY KEY, epoch_id bigint NOT NULL REFERENCES epochs(id), chain_arena integer NOT NULL,
  status text NOT NULL DEFAULT 'pending', seed bigint NOT NULL, budget numeric(30,0) NOT NULL,
  starts_at bigint NOT NULL, room_id text, roster jsonb NOT NULL, result jsonb, replay_hash text,
  ended_at bigint, heartbeat timestamptz, error text, UNIQUE(epoch_id,chain_arena)
);
CREATE TABLE IF NOT EXISTS replays (
  arena_id bigint REFERENCES arenas(id), sequence integer NOT NULL, events jsonb NOT NULL,
  PRIMARY KEY(arena_id,sequence)
);
CREATE TABLE IF NOT EXISTS transactions (
  id bigserial PRIMARY KEY, operation_key text NOT NULL UNIQUE, epoch_id bigint, wallet text,
  kind text NOT NULL, tx_hash text, status text NOT NULL, attempts integer NOT NULL DEFAULT 0,
  error text, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_health (
  name text PRIMARY KEY, heartbeat timestamptz NOT NULL DEFAULT now(), detail jsonb NOT NULL DEFAULT '{}'
);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS raw_tx text;
