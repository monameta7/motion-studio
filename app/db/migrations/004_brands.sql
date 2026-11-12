-- Responsibility: schema version 4 (Phase 8, several brands): every job, calendar day and usage row belongs to one brand, and each brand has its own schedule; everything made before belongs to the v1 brand 'mahdiyar', and so does the saved schedule.

ALTER TABLE jobs ADD COLUMN brand TEXT;
ALTER TABLE calendar ADD COLUMN brand TEXT;
ALTER TABLE usage ADD COLUMN brand TEXT;

UPDATE jobs SET brand = 'mahdiyar' WHERE brand IS NULL;
UPDATE calendar SET brand = 'mahdiyar' WHERE brand IS NULL;
UPDATE usage SET brand = 'mahdiyar' WHERE brand IS NULL;
-- Each brand has its own schedule (key `schedule:<brand>`); the one v1 schedule becomes Mahdiyar's.
INSERT OR IGNORE INTO settings (key, value_json, updated_at)
  SELECT 'schedule:mahdiyar', json_set(value_json, '$.brand', 'mahdiyar'), updated_at FROM settings WHERE key = 'schedule' AND json_valid(value_json);
DELETE FROM settings WHERE key = 'schedule' AND json_valid(value_json);

CREATE INDEX jobs_brand ON jobs (brand);
CREATE INDEX calendar_brand_date ON calendar (brand, date);

-- SQLite cannot add a NOT NULL column without a default; a default would label a forgotten brand silently. These refuse it loudly instead.
CREATE TRIGGER jobs_brand_insert BEFORE INSERT ON jobs WHEN NEW.brand IS NULL OR NEW.brand = '' BEGIN SELECT RAISE(ABORT, 'jobs.brand is required'); END;
CREATE TRIGGER jobs_brand_update BEFORE UPDATE OF brand ON jobs WHEN NEW.brand IS NULL OR NEW.brand = '' BEGIN SELECT RAISE(ABORT, 'jobs.brand is required'); END;
CREATE TRIGGER calendar_brand_insert BEFORE INSERT ON calendar WHEN NEW.brand IS NULL OR NEW.brand = '' BEGIN SELECT RAISE(ABORT, 'calendar.brand is required'); END;
CREATE TRIGGER calendar_brand_update BEFORE UPDATE OF brand ON calendar WHEN NEW.brand IS NULL OR NEW.brand = '' BEGIN SELECT RAISE(ABORT, 'calendar.brand is required'); END;
CREATE TRIGGER usage_brand_insert BEFORE INSERT ON usage WHEN NEW.brand IS NULL OR NEW.brand = '' BEGIN SELECT RAISE(ABORT, 'usage.brand is required'); END;
CREATE TRIGGER usage_brand_update BEFORE UPDATE OF brand ON usage WHEN NEW.brand IS NULL OR NEW.brand = '' BEGIN SELECT RAISE(ABORT, 'usage.brand is required'); END;
