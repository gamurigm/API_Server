create extension if not exists pgcrypto with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  role text not null default 'member' check (role in ('admin', 'member')),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.consumer_applications (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  enabled boolean not null default true,
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 100000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.identity_providers (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_application_id uuid not null references public.consumer_applications(id) on delete cascade,
  name text not null,
  issuer text not null,
  jwks_uri text not null,
  audiences text[] not null check (cardinality(audiences) > 0),
  scopes_claim text not null default 'scope',
  roles_claim text not null default 'roles',
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consumer_application_id, issuer)
);

create index identity_providers_issuer_idx
  on public.identity_providers (issuer)
  where enabled;

create table public.providers (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  base_url text not null,
  auth_type text not null default 'none'
    check (auth_type in ('none', 'api_key_header', 'api_key_query', 'bearer_static')),
  auth_config jsonb not null default '{}'::jsonb,
  timeout_ms integer not null default 25000 check (timeout_ms between 1000 and 25000),
  sse_timeout_ms integer not null default 300000 check (sse_timeout_ms between 1000 and 300000),
  rate_limit_per_minute integer not null default 60 check (rate_limit_per_minute between 1 and 100000),
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.provider_routes (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE')),
  path_template text not null check (path_template ~ '^/'),
  operation_id text not null,
  description text,
  required_scopes text[] not null default '{}',
  allowed_request_headers text[] not null default '{}',
  allowed_response_headers text[] not null default '{}',
  supports_sse boolean not null default false,
  enabled boolean not null default true,
  source text not null default 'manual' check (source in ('manual', 'openapi')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider_id, method, path_template)
);

create index provider_routes_lookup_idx
  on public.provider_routes (provider_id, method)
  where enabled;

create table public.application_provider_access (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_application_id uuid not null references public.consumer_applications(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  enabled boolean not null default true,
  rate_limit_per_minute integer check (rate_limit_per_minute between 1 and 100000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consumer_application_id, provider_id)
);

create table public.application_origins (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_application_id uuid not null references public.consumer_applications(id) on delete cascade,
  origin text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (consumer_application_id, origin)
);

create table public.credentials (
  id uuid primary key default extensions.gen_random_uuid(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  owner_type text not null check (owner_type in ('shared', 'application')),
  consumer_application_id uuid references public.consumer_applications(id) on delete cascade,
  label text not null,
  vault_secret_id uuid not null unique,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (
    (owner_type = 'shared' and consumer_application_id is null)
    or
    (owner_type = 'application' and consumer_application_id is not null)
  )
);

create unique index credentials_one_active_shared_idx
  on public.credentials (provider_id)
  where owner_type = 'shared' and enabled;

create unique index credentials_one_active_application_idx
  on public.credentials (provider_id, consumer_application_id)
  where owner_type = 'application' and enabled;

create table public.external_principals (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_application_id uuid not null references public.consumer_applications(id) on delete cascade,
  identity_provider_id uuid not null references public.identity_providers(id) on delete cascade,
  issuer text not null,
  subject text not null,
  last_scopes text[] not null default '{}',
  last_roles text[] not null default '{}',
  first_seen_at timestamptz not null default timezone('utc', now()),
  last_seen_at timestamptz not null default timezone('utc', now()),
  unique (identity_provider_id, subject)
);

create table public.rate_limit_buckets (
  consumer_application_id uuid not null references public.consumer_applications(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  subject text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0,
  primary key (consumer_application_id, provider_id, subject)
);

create table public.stream_leases (
  id uuid primary key default extensions.gen_random_uuid(),
  consumer_application_id uuid not null references public.consumer_applications(id) on delete cascade,
  provider_id uuid not null references public.providers(id) on delete cascade,
  subject text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index stream_leases_active_idx
  on public.stream_leases (consumer_application_id, provider_id, subject, expires_at);
create index stream_leases_expiry_idx
  on public.stream_leases (expires_at);

create table public.invocations (
  id uuid primary key default extensions.gen_random_uuid(),
  request_id uuid not null unique,
  consumer_application_id uuid references public.consumer_applications(id) on delete set null,
  identity_provider_id uuid references public.identity_providers(id) on delete set null,
  provider_id uuid references public.providers(id) on delete set null,
  provider_route_id uuid references public.provider_routes(id) on delete set null,
  issuer text,
  subject text,
  method text not null,
  path text not null,
  outcome text not null check (outcome in ('upstream', 'gateway_error')),
  gateway_error_code text,
  upstream_status integer,
  duration_ms integer not null default 0,
  response_bytes bigint,
  created_at timestamptz not null default timezone('utc', now())
);

create index invocations_created_at_idx on public.invocations (created_at desc);
create index invocations_application_idx on public.invocations (consumer_application_id, created_at desc);
create index invocations_subject_idx on public.invocations (identity_provider_id, subject, created_at desc);

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger consumer_applications_set_updated_at
before update on public.consumer_applications
for each row execute function public.set_updated_at();

create trigger identity_providers_set_updated_at
before update on public.identity_providers
for each row execute function public.set_updated_at();

create trigger providers_set_updated_at
before update on public.providers
for each row execute function public.set_updated_at();

create trigger provider_routes_set_updated_at
before update on public.provider_routes
for each row execute function public.set_updated_at();

create trigger application_provider_access_set_updated_at
before update on public.application_provider_access
for each row execute function public.set_updated_at();

create trigger application_origins_set_updated_at
before update on public.application_origins
for each row execute function public.set_updated_at();

create trigger credentials_set_updated_at
before update on public.credentials
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.create_gateway_credential(
  p_provider_id uuid,
  p_owner_type text,
  p_consumer_application_id uuid,
  p_label text,
  p_secret text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_secret_id uuid;
  v_credential_id uuid;
begin
  if p_secret is null or length(p_secret) = 0 then
    raise exception 'Secret value is required';
  end if;

  if p_owner_type not in ('shared', 'application') then
    raise exception 'Invalid owner type';
  end if;

  if (p_owner_type = 'shared' and p_consumer_application_id is not null)
     or (p_owner_type = 'application' and p_consumer_application_id is null) then
    raise exception 'Credential owner is inconsistent';
  end if;

  perform 1 from public.providers where id = p_provider_id;
  if not found then
    raise exception 'Provider not found';
  end if;

  update public.credentials
  set enabled = false
  where provider_id = p_provider_id
    and owner_type = p_owner_type
    and consumer_application_id is not distinct from p_consumer_application_id
    and enabled;

  select vault.create_secret(
    p_secret,
    'gateway-' || extensions.gen_random_uuid()::text,
    'Federated API Gateway credential'
  ) into v_secret_id;

  insert into public.credentials (
    provider_id,
    owner_type,
    consumer_application_id,
    label,
    vault_secret_id
  ) values (
    p_provider_id,
    p_owner_type,
    p_consumer_application_id,
    p_label,
    v_secret_id
  ) returning id into v_credential_id;

  return v_credential_id;
end;
$$;

create or replace function public.read_gateway_secret(p_credential_id uuid)
returns text
language sql
security definer
set search_path = ''
stable
as $$
  select decrypted.decrypted_secret
  from public.credentials credential
  join vault.decrypted_secrets decrypted
    on decrypted.id = credential.vault_secret_id
  where credential.id = p_credential_id
    and credential.enabled
  limit 1;
$$;

create or replace function public.consume_rate_limit(
  p_consumer_application_id uuid,
  p_provider_id uuid,
  p_subject text,
  p_limit integer
)
returns table (allowed boolean, remaining integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := date_trunc('minute', timezone('utc', now()));
  v_count integer;
begin
  if p_limit < 1 then
    raise exception 'Rate limit must be positive';
  end if;

  insert into public.rate_limit_buckets (
    consumer_application_id,
    provider_id,
    subject,
    window_started_at,
    request_count
  ) values (
    p_consumer_application_id,
    p_provider_id,
    p_subject,
    v_window,
    1
  )
  on conflict (consumer_application_id, provider_id, subject)
  do update set
    window_started_at = case
      when public.rate_limit_buckets.window_started_at < v_window then v_window
      else public.rate_limit_buckets.window_started_at
    end,
    request_count = case
      when public.rate_limit_buckets.window_started_at < v_window then 1
      else public.rate_limit_buckets.request_count + 1
    end
  returning request_count into v_count;

  return query select
    v_count <= p_limit,
    greatest(p_limit - v_count, 0),
    v_window + interval '1 minute';
end;
$$;

create or replace function public.acquire_stream_lease(
  p_consumer_application_id uuid,
  p_provider_id uuid,
  p_subject text,
  p_limit integer,
  p_ttl_seconds integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
  v_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_consumer_application_id::text || ':' || p_provider_id::text || ':' || p_subject,
      0
    )
  );

  delete from public.stream_leases where expires_at <= timezone('utc', now());
  select count(*) into v_active
  from public.stream_leases
  where consumer_application_id = p_consumer_application_id
    and provider_id = p_provider_id
    and subject = p_subject
    and expires_at > timezone('utc', now());

  if v_active >= p_limit then
    return null;
  end if;

  insert into public.stream_leases (
    consumer_application_id,
    provider_id,
    subject,
    expires_at
  ) values (
    p_consumer_application_id,
    p_provider_id,
    p_subject,
    timezone('utc', now()) + make_interval(secs => p_ttl_seconds)
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.release_stream_lease(p_lease_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.stream_leases where id = p_lease_id;
$$;

alter table public.profiles enable row level security;
alter table public.consumer_applications enable row level security;
alter table public.identity_providers enable row level security;
alter table public.providers enable row level security;
alter table public.provider_routes enable row level security;
alter table public.application_provider_access enable row level security;
alter table public.application_origins enable row level security;
alter table public.credentials enable row level security;
alter table public.external_principals enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.stream_leases enable row level security;
alter table public.invocations enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

revoke all on function public.create_gateway_credential(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.read_gateway_secret(uuid) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(uuid, uuid, text, integer) from public, anon, authenticated;
revoke all on function public.acquire_stream_lease(uuid, uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.release_stream_lease(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
grant execute on function public.create_gateway_credential(uuid, text, uuid, text, text) to service_role;
grant execute on function public.read_gateway_secret(uuid) to service_role;
grant execute on function public.consume_rate_limit(uuid, uuid, text, integer) to service_role;
grant execute on function public.acquire_stream_lease(uuid, uuid, text, integer, integer) to service_role;
grant execute on function public.release_stream_lease(uuid) to service_role;

revoke all on vault.decrypted_secrets from anon, authenticated;
