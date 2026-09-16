ALTER TABLE anonymous_users
  ADD COLUMN visit_count INTEGER NOT NULL DEFAULT 1 CHECK (visit_count >= 1);

UPDATE anonymous_users
SET visit_count = 2
WHERE is_returning = 1;
