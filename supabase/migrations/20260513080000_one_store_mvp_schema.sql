create table if not exists public.users (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null default 'manager',
  account_type text not null default 'manager',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sessions (
  id text primary key,
  user_id integer not null references public.users(id) on delete cascade,
  token_hash text not null,
  user_agent text,
  ip_address text,
  revoked boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id serial primary key,
  name text not null,
  phone text not null,
  email text,
  loyalty_points integer not null default 0,
  total_spend real not null default 0,
  visit_count integer not null default 0,
  tags text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tables (
  id serial primary key,
  number integer not null unique,
  capacity integer not null,
  status text not null default 'available',
  section text not null default 'main',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.products (
  id serial primary key,
  name text not null,
  price real not null,
  category text not null,
  description text,
  available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id serial primary key,
  customer_id integer references public.customers(id) on delete set null,
  table_id integer references public.tables(id) on delete set null,
  type text not null default 'dine-in',
  status text not null default 'pending',
  payment_status text not null default 'unpaid',
  payment_method text not null default 'unpaid',
  paid_amount real not null default 0,
  total_amount real not null default 0,
  payment_note text,
  paid_at timestamptz,
  notes text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id serial primary key,
  order_id integer not null references public.orders(id) on delete cascade,
  product_id integer not null references public.products(id) on delete restrict,
  product_name text not null,
  quantity integer not null,
  unit_price real not null,
  subtotal real not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.visits (
  id serial primary key,
  customer_id integer not null references public.customers(id) on delete cascade,
  order_id integer,
  visited_at timestamptz not null default now(),
  amount real not null default 0,
  order_type text not null default 'dine-in',
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.reservations (
  id serial primary key,
  customer_id integer references public.customers(id) on delete set null,
  customer_name text not null,
  customer_phone text not null,
  table_id integer references public.tables(id) on delete set null,
  party_size integer not null,
  reserved_at timestamptz not null,
  status text not null default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inventory (
  id serial primary key,
  name text not null,
  category text not null default '其他',
  unit text not null default '個',
  quantity real not null default 0,
  min_quantity real not null default 0,
  cost real not null default 0,
  supplier text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id serial primary key,
  order_id integer not null,
  payment_status text,
  payment_method text,
  subtotal real,
  discount real,
  service_charge real,
  actual_paid real,
  payment_time timestamptz not null default now()
);

create table if not exists public.staff (
  id serial primary key,
  name text not null,
  role text not null default 'server',
  phone text not null,
  email text,
  status text not null default 'active',
  hire_date text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shifts (
  id serial primary key,
  staff_id integer not null references public.staff(id) on delete cascade,
  date text not null,
  start_time text not null,
  end_time text not null,
  role text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id serial primary key,
  staff_id integer references public.staff(id) on delete set null,
  title text not null,
  description text,
  status text not null default 'todo',
  priority text not null default 'medium',
  due_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigserial primary key,
  actor_user_id integer references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sessions_user_id on public.sessions(user_id);
create index if not exists idx_sessions_token_hash on public.sessions(token_hash);
create index if not exists idx_sessions_expires_at on public.sessions(expires_at);
create index if not exists idx_orders_status on public.orders(status);
create index if not exists idx_orders_created_at on public.orders(created_at desc);
create index if not exists idx_orders_idempotency_key on public.orders(idempotency_key);
create index if not exists idx_order_items_order_id on public.order_items(order_id);
create index if not exists idx_reservations_reserved_at on public.reservations(reserved_at);
create index if not exists idx_audit_logs_entity on public.audit_logs(entity_type, entity_id);

insert into public.tables (number, capacity, section)
values (1, 2, 'main'), (2, 4, 'main'), (3, 4, 'main'), (4, 6, 'main')
on conflict (number) do nothing;

insert into public.products (name, price, category, description)
values
  ('招牌牛肉麵', 180, '主餐', 'MVP seed product'),
  ('雞肉飯', 120, '主餐', 'MVP seed product'),
  ('燙青菜', 60, '小菜', 'MVP seed product'),
  ('紅茶', 40, '飲料', 'MVP seed product')
on conflict do nothing;
