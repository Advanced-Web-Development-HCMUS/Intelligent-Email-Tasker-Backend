-- Migration: Enable pg_trgm extension for fuzzy search
-- Date: 2026-01-18
-- Description: Enables PostgreSQL pg_trgm (Trigram) extension for typo-tolerant fuzzy search

-- Enable pg_trgm extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Verify extension is installed
SELECT extname, extversion FROM pg_extension WHERE extname = 'pg_trgm';



-- Migration: Create GIN indexes for fuzzy search on email_raw table
-- Date: 2026-01-18
-- Description: Creates GIN (Generalized Inverted Index) indexes using pg_trgm for fast fuzzy search

-- Create GIN index for subject field
-- This enables fast similarity search on email subjects
CREATE INDEX IF NOT EXISTS idx_email_raw_subject_trgm 
ON email_raw 
USING gin (subject gin_trgm_ops);

-- Create GIN index for fromName field
-- This enables fast similarity search on sender names
CREATE INDEX IF NOT EXISTS idx_email_raw_from_name_trgm 
ON email_raw 
USING gin ("fromName" gin_trgm_ops);

-- Create GIN index for from field (email address)
-- This enables fast similarity search on sender email addresses
CREATE INDEX IF NOT EXISTS idx_email_raw_from_trgm 
ON email_raw 
USING gin ("from" gin_trgm_ops);



-- Verify indexes were created
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'email_raw' 
AND indexname LIKE '%_trgm'
ORDER BY indexname;

-- Performance tips:
-- 1. Creating indexes on large tables may take time
-- 2. bodyText index can be very large - consider skipping if you have millions of emails
-- 3. You can drop the bodyText index if performance is acceptable without it:
--    DROP INDEX IF EXISTS idx_email_raw_body_text_trgm;
