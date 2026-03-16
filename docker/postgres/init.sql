-- Enable pgroonga extension for Chinese/Japanese/Korean full-text search
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- Create separate database for Keycloak (if not exists)
SELECT 'CREATE DATABASE keycloak OWNER ' || current_user
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'keycloak')\gexec
