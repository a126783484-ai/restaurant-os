-- Core production indexes for the one-store P0/P1 operating baseline.
-- Keep this migration limited to safe btree indexes used by hot API paths.

create index if not exists idx_orders_table_id
  on public.orders(table_id)
  where table_id is not null;

create index if not exists idx_orders_type
  on public.orders(type);

create index if not exists idx_orders_customer_id
  on public.orders(customer_id)
  where customer_id is not null;

create index if not exists idx_orders_table_status_type
  on public.orders(table_id, status, type)
  where table_id is not null;

create index if not exists idx_payments_order_id_status
  on public.payments(order_id, status);

create index if not exists idx_visits_customer_id
  on public.visits(customer_id);

create index if not exists idx_visits_visited_at
  on public.visits(visited_at desc);

create index if not exists idx_reservations_status
  on public.reservations(status);

create index if not exists idx_reservations_table_id
  on public.reservations(table_id)
  where table_id is not null;

create index if not exists idx_reservations_status_reserved_at
  on public.reservations(status, reserved_at);

create index if not exists idx_staff_status
  on public.staff(status);

create index if not exists idx_shifts_staff_id
  on public.shifts(staff_id);

create index if not exists idx_shifts_date
  on public.shifts(date);

create index if not exists idx_tasks_staff_id
  on public.tasks(staff_id)
  where staff_id is not null;

create index if not exists idx_tasks_status
  on public.tasks(status);
