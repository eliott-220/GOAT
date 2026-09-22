import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

/**
 * Base Postgres embarquée (PGlite) avec toutes les migrations de supabase/migrations appliquées.
 * Supabase est imité au minimum : schéma `auth`, rôles anon/authenticated et privilèges par défaut du schéma public.
 */
const MIGRATIONS_DIR = new URL('../../../supabase/migrations/', import.meta.url)

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;

  create schema auth;
  create table auth.users (
    id uuid primary key default gen_random_uuid(),
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;

  -- Comme sur Supabase : tout objet créé ensuite dans public est accessible aux rôles API (sauf revoke explicite).
  grant usage on schema public, auth to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`

export async function createMigratedDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(SUPABASE_STUB)
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) await db.exec(readFileSync(new URL(file, MIGRATIONS_DIR), 'utf8'))
  return db
}
