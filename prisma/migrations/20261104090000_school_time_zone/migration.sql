-- A school's own time zone: where its day starts, for the limits counted in days (a pupil's practice cap, the reports one person may make). Until now both counted the UTC day.
-- Additive: one column with a default, so every school keeps the UTC day until its administrator chooses a zone. The code that names the column needs this migration first.
-- The application checks that the name is a time zone (the database's own list is not the application's); the database holds the length, so a value cannot be unbounded.

ALTER TABLE "SchoolSettings" ADD COLUMN "timeZone" TEXT NOT NULL DEFAULT 'UTC';

ALTER TABLE "SchoolSettings" ADD CONSTRAINT "SchoolSettings_timeZone_length" CHECK (char_length("timeZone") BETWEEN 1 AND 64);
