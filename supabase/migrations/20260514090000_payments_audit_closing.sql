-- Production Hardening Sprint 1: payment ledger, audit logs, and reconciliation indexes.
--
-- This migration must work for both:
-- 1. Fresh databases that never had a payments table.
-- 2. Older databases that already had the legacy payments columns
--    payment_status / payment_method / subtotal / actual_paid / payment_time.
-- 3. Older databases that already had audit_logs(metadata) but no before/after columns.
--
-- Do not directly reference legacy columns outside dynamic SQL. PostgreSQL parses column
-- names before runtime, so fresh databases would fail if those columns do not exist.

create table if not exists public.payments (
  id serial primary key,
  order_id integer not null references public.orders(id) on delete cascade,
  amount real not null default 0,
  method text not null default 'cash',
  status text not null default 'paid',
  note text,
  external_reference text,
  created_by integer references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  refunded_at timestamptz,
  cancelled_at timestamptz
);

alter table public.payments add column if not exists amount real not null default 0;
alter table public.payments add column if not exists method text not null default 'cash';
alter table public.payments add column if not exists status text not null default 'paid';
alter table public.payments add column if not exists note text;
alter table public.payments add column if not exists external_reference text;
alter table public.payments add column if not exists created_by integer references public.users(id) on delete set null;
alter table public.payments add column if not exists created_at timestamptz not null default now();
alter table public.payments add column if not exists updated_at timestamptz not null default now();
alter table public.payments add column if not exists refunded_at timestamptz;
alter table public.payments add column if not exists cancelled_at timestamptz;

-- Backfill from the legacy payment schema only when those legacy columns exist.
do $$
declare
  has_actual_paid boolean;
  has_subtotal boolean;
  has_payment_method boolean;
  has_payment_status boolean;
  has_payment_time boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'actual_paid'
  ) into has_actual_paid;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'subtotal'
  ) into has_subtotal;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'payment_method'
  ) into has_payment_method;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'payment_status'
  ) into has_payment_status;

  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'payment_time'
  ) into has_payment_time;

  if has_actual_paid or has_subtotal or has_payment_method or has_payment_status or has_payment_time then
    execute format(
      'update public.payments
       set amount = coalesce(nullif(amount, 0), %s, %s, amount),
           method = coalesce(nullif(method, ''''), %s, method, ''cash''),
           status = case
             when %s in (''refunded'', ''cancelled'') then %s
             when status in (''paid'', ''refunded'', ''cancelled'') then status
             else ''paid''
           end,
           created_at = coalesce(created_at, %s, now()),
           updated_at = coalesce(updated_at, %s, now())',
      case when has_actual_paid then 'nullif(actual_paid, 0)' else 'null' end,
      case when has_subtotal then 'nullif(subtotal, 0)' else 'null' end,
      case when has_payment_method then 'payment_method' else 'null' end,
      case when has_payment_status then 'payment_status' else 'null' end,
      case when has_payment_status then 'payment_status' else 'status' end,
      case when has_payment_time then 'payment_time' else 'null' end,
      case when has_payment_time then 'payment_time' else 'null' end
    );
  end if;
end $$;

-- Add constraints idempotently. Constraints are NOT VALID so existing legacy rows do not
-- block the migration, while new writes still get the production guardrails.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_positive') then
    alter table public.payments add constraint payments_amount_positive check (amount > 0) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payments_method_allowed') then
    alter table public.payments add constraint payments_method_allowed check (method in ('cash', 'card', 'transfer', 'external')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payments_status_allowed') then
    alter table public.payments add constraint payments_status_allowed check (status in ('paid', 'refunded', 'cancelled')) not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'payments_order_id_orders_id_fk') then
    alter table public.payments
      add constraint payments_order_id_orders_id_fk foreign key (order_id) references public.orders(id) on delete cascade not valid;
  end if;
end $$;

create index if not exists idx_payments_order_id on public.payments(order_id);
create index if not exists idx_payments_created_at on public.payments(created_at);
create index if not exists idx_payments_method on public.payments(method);
create index if not exists idx_payments_status on public.payments(status);

create table if not exists public.audit_logs (
  id serial primary key,
  actor_user_id integer references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Existing production already had audit_logs(metadata) before this sprint. Add the
-- new columns explicitly so payment-service inserts into before/after do not fail.
alter table public.audit_logs add column if not exists actor_user_id integer references public.users(id) on delete set null;
alter table public.audit_logs add column if not exists action text;
alter table public.audit_logs add column if not exists entity_type text;
alter table public.audit_logs add column if not exists entity_id text;
alter table public.audit_logs add column if not exists before jsonb;
alter table public.audit_logs add column if not exists after jsonb;
alter table public.audit_logs add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.audit_logs add column if not exists created_at timestamptz not null default now();

create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
