-- Explicit credential deletion can be retried safely if Vault is unavailable.
alter table public.credentials
  add column delete_requested_at timestamptz,
  add constraint credential_delete_request_requires_retirement
    check (delete_requested_at is null or retired_at is not null),
  add constraint credential_delete_request_disables_credential
    check (delete_requested_at is null or not enabled);
