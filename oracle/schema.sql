CREATE SCHEMA IF NOT EXISTS vg;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS vg.users(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 email text NOT NULL UNIQUE,
 display_name text NOT NULL DEFAULT '',
 role text NOT NULL CHECK(role IN ('admin','ufficio','operatore')),
 password_hash text NOT NULL,
 active boolean NOT NULL DEFAULT TRUE,
 failed_attempts integer NOT NULL DEFAULT 0,
 locked_until timestamptz
);
CREATE TABLE IF NOT EXISTS vg.workspace_members(
 workspace_id text NOT NULL CHECK(workspace_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 user_id uuid NOT NULL REFERENCES vg.users(id) ON DELETE CASCADE,
 can_write boolean NOT NULL DEFAULT FALSE,
 PRIMARY KEY(workspace_id,user_id)
);
CREATE TABLE IF NOT EXISTS vg.workspaces(
 id text PRIMARY KEY,
 revision bigint NOT NULL DEFAULT 0,
 snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid REFERENCES vg.users(id)
);
CREATE TABLE IF NOT EXISTS vg.sessions(
 token_sha256 char(64) PRIMARY KEY,
 user_id uuid NOT NULL REFERENCES vg.users(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS vg_sessions_expire ON vg.sessions(expires_at);
CREATE TABLE IF NOT EXISTS vg.workspace_audit(
 audit_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 workspace_id text NOT NULL,
 user_id uuid NOT NULL REFERENCES vg.users(id),
 revision bigint NOT NULL,
 sha256 char(64) NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,revision)
);
