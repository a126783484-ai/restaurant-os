-- RLS hardening draft for restaurant-os.
-- Do not apply blindly in production until backend DB connection mode is confirmed.
-- Enabling RLS without matching policies can block application access.

-- Recommended operating model:
-- 1. Backend server uses DATABASE_URL / privileged server-side connection.
-- 2. Frontend never writes directly to these tables using anon key.
-- 3. If direct Supabase client access is introduced later, add strict role/workspace policies first.

-- Baseline lockdown draft:
-- ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tables ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.inventory ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Future policy examples must be designed around app roles and workspace/store scope.
-- For one-store MVP, prefer backend-only DB access and no public table exposure.
