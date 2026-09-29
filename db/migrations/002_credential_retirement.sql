-- Rotated credentials are retired permanently; manual disable remains reversible.
alter table public.credentials
  add column retired_at timestamptz,
  add column vault_deleted_at timestamptz,
  add constraint retired_credentials_disabled check (retired_at is null or not enabled),
  add constraint vault_deleted_only_after_retirement check (vault_deleted_at is null or retired_at is not null);
