CREATE TABLE anonymous_user_daily (
  usage_date TEXT NOT NULL,
  id_hash TEXT NOT NULL,
  country_code TEXT NOT NULL DEFAULT 'ZZ',
  PRIMARY KEY (usage_date, id_hash)
) WITHOUT ROWID;

CREATE INDEX anonymous_user_daily_country_date_idx
  ON anonymous_user_daily(country_code, usage_date);

CREATE TABLE anonymous_daily_usage (
  usage_date TEXT NOT NULL PRIMARY KEY,
  total_visits INTEGER NOT NULL DEFAULT 0
) WITHOUT ROWID;
