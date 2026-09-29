-- Durable retry records for secrets that could not be compensated after a failed DB write.
create table public.vault_cleanup_queue (
  credential_id uuid primary key,
  vault_path text not null unique,
  queued_at timestamptz not null default now(),
  constraint vault_cleanup_path_matches_id
    check (vault_path = 'gateway/credentials/' || credential_id::text)
);
