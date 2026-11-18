-- 사업자 프로필과 등록증 변경을 같은 거래 안에서 보존한다.
begin;
alter table public.customers
  add column if not exists business_profile jsonb not null default '{}'::jsonb,
  add column if not exists business_profile_changed_at timestamptz,
  add column if not exists business_change_count integer not null default 0;

create table if not exists public.customer_business_history (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null,
  snapshot jsonb not null,
  previous_since timestamptz,
  changed_at timestamptz not null default statement_timestamp(),
  constraint customer_business_snapshot_object check (jsonb_typeof(snapshot) = 'object')
);
create index if not exists customer_business_history_customer_time
  on public.customer_business_history (customer_id, changed_at desc, id desc);
alter table public.customer_business_history enable row level security;
-- 고객 자료를 읽을 수 있는 호출자만 해당 고객의 이력도 읽는다.
-- customers 권한을 직원 전용으로 전환하면 이력도 그 제한을 따른다.
drop policy if exists customer_business_history_read on public.customer_business_history;
create policy customer_business_history_read on public.customer_business_history
  for select to anon, authenticated
  using (exists (select 1 from public.customers c where c.id::text = customer_business_history.customer_id));
revoke all on public.customer_business_history from anon, authenticated;
grant select on public.customer_business_history to anon, authenticated;

create or replace function public.preserve_customer_business_history()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if jsonb_typeof(new.business_profile) is distinct from 'object'
     or pg_catalog.octet_length(new.business_profile::text) > 8192 then
    raise exception '사업자 정보 형식 또는 길이를 확인해주세요.';
  end if;
  -- 이력 집계·변경 시각을 직접 수정하는 것은 허용하지 않는다.
  new.business_change_count := old.business_change_count;
  new.business_profile_changed_at := old.business_profile_changed_at;
  if new.business_profile is distinct from old.business_profile
     or new.business_cert_url is distinct from old.business_cert_url
     or new.business_cert_path is distinct from old.business_cert_path then
    if old.business_profile <> '{}'::jsonb or old.business_cert_url is not null or old.business_cert_path is not null then
      insert into public.customer_business_history(customer_id, snapshot, previous_since)
        values (old.id::text, pg_catalog.jsonb_build_object(
          'profile', old.business_profile, 'cert_url', old.business_cert_url,
          'cert_path', old.business_cert_path, 'customer_name', old.name
        ), old.business_profile_changed_at);
      new.business_change_count := old.business_change_count + 1;
    end if;
    new.business_profile_changed_at := pg_catalog.statement_timestamp();
  end if;
  return new;
end $$;
revoke all on function public.preserve_customer_business_history() from public;
drop trigger if exists preserve_customer_business_history on public.customers;
create trigger preserve_customer_business_history before update on public.customers
  for each row execute function public.preserve_customer_business_history();
notify pgrst, 'reload schema';
commit;
