CREATE TABLE anonymous_users (
  id_hash TEXT PRIMARY KEY NOT NULL,
  first_seen_date TEXT NOT NULL,
  last_seen_date TEXT NOT NULL,
  is_returning INTEGER NOT NULL DEFAULT 0 CHECK (is_returning IN (0, 1))
) WITHOUT ROWID;

CREATE INDEX anonymous_users_last_seen_date_idx ON anonymous_users(last_seen_date);
