PRAGMA foreign_keys=ON;
CREATE TABLE households (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES user(id), created_at TEXT NOT NULL
);
CREATE TABLE household_members (
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK(role IN ('owner','caregiver','member')),
  joined_at TEXT NOT NULL, PRIMARY KEY(household_id,user_id)
);
CREATE INDEX household_members_user ON household_members(user_id);
CREATE TABLE profiles (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('adult','child','pet')),
  linked_user_id TEXT REFERENCES user(id), archived_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX profiles_household ON profiles(household_id);
CREATE TABLE profile_grants (
  household_id TEXT NOT NULL, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  capability TEXT NOT NULL CHECK(capability IN ('view_schedule','record_dose','manage_medication','view_history')),
  created_at TEXT NOT NULL,
  PRIMARY KEY(profile_id,user_id,capability),
  FOREIGN KEY(household_id,user_id) REFERENCES household_members(household_id,user_id) ON DELETE CASCADE
);
CREATE TABLE medications (
  id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL, form TEXT NOT NULL DEFAULT '', dose TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '', cadence TEXT NOT NULL CHECK(cadence IN ('daily','weekdays','interval_days','prn')),
  weekdays_json TEXT NOT NULL DEFAULT '[]', interval_days INTEGER, anchor_date TEXT,
  start_date TEXT NOT NULL, end_date TEXT, clinician TEXT, refill_note TEXT,
  archived_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX meds_profile ON medications(profile_id);
CREATE TABLE medication_times (
  medication_id TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
  hhmm TEXT NOT NULL, PRIMARY KEY(medication_id,hhmm)
);
CREATE TABLE medication_changes (
  id TEXT PRIMARY KEY, medication_id TEXT NOT NULL REFERENCES medications(id),
  changed_by TEXT NOT NULL REFERENCES user(id), changed_at TEXT NOT NULL,
  before_json TEXT, after_json TEXT NOT NULL
);
CREATE TABLE dose_events (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id),
  profile_id TEXT NOT NULL REFERENCES profiles(id), medication_id TEXT NOT NULL REFERENCES medications(id),
  occurrence_key TEXT, scheduled_date TEXT, scheduled_time TEXT, schedule_timezone TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('given','skipped','refused','uncertain','missed')),
  med_name_snapshot TEXT NOT NULL, dose_snapshot TEXT NOT NULL,
  occurred_at TEXT NOT NULL, recorded_at TEXT NOT NULL, actor_user_id TEXT NOT NULL REFERENCES user(id),
  note TEXT NOT NULL DEFAULT '', supersedes_event_id TEXT UNIQUE REFERENCES dose_events(id),
  idempotency_key TEXT NOT NULL UNIQUE
);
CREATE UNIQUE INDEX first_record_per_occurrence ON dose_events(occurrence_key)
  WHERE occurrence_key IS NOT NULL AND supersedes_event_id IS NULL;
CREATE INDEX dose_events_profile_date ON dose_events(profile_id,scheduled_date);
CREATE INDEX dose_events_med ON dose_events(medication_id,recorded_at);
CREATE TABLE invitations (
  id TEXT PRIMARY KEY, household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, role TEXT NOT NULL CHECK(role IN ('caregiver','member')),
  grants_json TEXT NOT NULL, created_by TEXT NOT NULL REFERENCES user(id),
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL,
  claimed_by TEXT REFERENCES user(id), claimed_at TEXT,
  revoked_at TEXT
);
CREATE INDEX invitation_household ON invitations(household_id);
CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth_secret TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX push_user ON push_subscriptions(user_id);
CREATE TABLE push_preferences (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  household_id TEXT NOT NULL REFERENCES households(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id,household_id)
);
CREATE TABLE push_deliveries (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES user(id),
  occurrence_key TEXT NOT NULL, state TEXT NOT NULL CHECK(state IN ('sending','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0, last_attempt_at TEXT,
  UNIQUE(user_id,occurrence_key)
);
