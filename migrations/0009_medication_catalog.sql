PRAGMA foreign_keys=ON;
-- Nullable descriptive catalog metadata; no existing medication schedule or dose is changed.
ALTER TABLE medications ADD COLUMN catalog_source TEXT;
ALTER TABLE medications ADD COLUMN catalog_identifier TEXT;
ALTER TABLE medications ADD COLUMN normalized_name TEXT;
ALTER TABLE medications ADD COLUMN brand_name TEXT;
-- Product strength is the unmodified RxTerms STRENGTHS_AND_FORMS label,
-- NOT the prescribed dose or administration instruction.
ALTER TABLE medications ADD COLUMN product_strength TEXT;
ALTER TABLE medications ADD COLUMN dosage_form TEXT;

-- Durable per-account proxy rate limit across Cloudflare Worker isolates.
CREATE TABLE medication_catalog_search_limits (
 user_id TEXT PRIMARY KEY REFERENCES user(id) ON DELETE CASCADE,
 window_start_ms INTEGER NOT NULL,
 request_count INTEGER NOT NULL
);
