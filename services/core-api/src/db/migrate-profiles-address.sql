-- Migration: add address column to profiles table
-- Run once against the live Docker Postgres instance:
--   docker exec -i pure_app-db-1 psql -U pure_user -d pure_db < services/core-api/src/db/migrate-profiles-address.sql

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS address TEXT;
