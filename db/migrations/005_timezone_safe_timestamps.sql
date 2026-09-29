-- Use absolute timestamptz values, independent of each connection's session timezone.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

alter table public.consumer_applications
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.identity_providers
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.providers
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.provider_routes
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.application_provider_access
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.application_origins
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.credentials
  alter column created_at set default now(),
  alter column updated_at set default now();
alter table public.external_principals
  alter column first_seen_at set default now(),
  alter column last_seen_at set default now();
alter table public.stream_leases
  alter column created_at set default now();
alter table public.invocations
  alter column created_at set default now();

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
  v_window timestamptz := date_trunc('minute', now());
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

  delete from public.stream_leases where expires_at <= now();
  select count(*) into v_active
  from public.stream_leases
  where consumer_application_id = p_consumer_application_id
    and provider_id = p_provider_id
    and subject = p_subject
    and expires_at > now();

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
    now() + make_interval(secs => p_ttl_seconds)
  ) returning id into v_id;
  return v_id;
end;
$$;
