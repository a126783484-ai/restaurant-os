-- Production Hardening Sprint 1: payment ledger, audit logs, and reconciliation indexes.

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

update public.payments
set amount = coalesce(nullif(amount, 0), actual_paid, subtotal, 0),
    method = coalesce(method, payment_method, 'cash'),
    status = coalesce(status, payment_status, 'paid'),
    created_at = coalesce(created_at, payment_time, now()),
    updated_at = coalesce(updated_at, payment_time, now())
where amount = 0 or method is null or status is null;

alter table public.payments add constraint payments_amount_positive check (amount > 0) not valid;
alter table public.payments add constraint payments_method_allowed check (method in ('cash', 'card', 'transfer', 'external')) not valid;
alter table public.payments add constraint payments_status_allowed check (status in ('paid', 'refunded', 'cancelled')) not valid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'payments_order_id_orders_id_fk'
  ) then
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
  entity_id text not null,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at);
