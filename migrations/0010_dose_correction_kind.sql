PRAGMA foreign_keys=ON;
-- An append-only correction can explicitly state that the dose was never administered,
-- without erasing the original administration and without freeing the uniqueness
-- constraint for an unreviewed second dose. Legacy dose events remain untouched.
ALTER TABLE dose_events ADD COLUMN correction_kind TEXT
 CHECK(correction_kind IS NULL OR correction_kind='not_administered');
