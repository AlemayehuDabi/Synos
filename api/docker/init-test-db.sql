-- Runs once when the postgres container's data volume is first created.
-- Gives the e2e suite its own database, separate from local dev data.
CREATE DATABASE synos_test;
