import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  ShoppingBag,
  UserCog,
  UtensilsCrossed,
  ChefHat,
  Menu,
  X,
  LayoutGrid,
  LogOut,
  Package,
  Brain,
  Sparkles,
  Radio,
  ArrowUpRight,
  Wallet,
} from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getCurrentUser, useLogout, type AuthRole } from "@/hooks/use-auth";

const navItems: Array<{ href: string; label: string; shortLabel?: string; icon: React.ElementType; roles?: AuthRole[] }> = [
  { href: "/", label: "儀表板", shortLabel: "首頁", icon: LayoutDashboard },
  { href: "/kitchen", label: "廚房顯示", shortLabel: "廚房", icon: ChefHat, roles: ["admin", "manager", "kitchen"] },
  { href: "/floor-plan", label: "樓層平面圖", shortLabel: "桌位", icon: LayoutGrid, roles: ["admin", "manager", "staff"] },
  { href: "/orders", label: "訂單管理", shortLabel: "訂單", icon: ShoppingBag, roles: ["admin", "manager", "staff"] },
  { href: "/reservations", label: "訂位管理", shortLabel: "訂位", icon: CalendarDays, roles: ["admin", "manager", "staff"] },
  { href: "/customers", label: "顧客管理", shortLabel: "顧客", icon: Users, roles: ["admin", "manager", "staff"] },
  { href: "/products", label: "菜單管理", shortLabel: "菜單", icon: UtensilsCrossed, roles: ["admin", "manager", "staff"] },
  { href: "/inventory", label: "庫存管理", shortLabel: "庫存", icon: Package, roles: ["admin", "manager", "staff"] },
  { href: "/staff", label: "員工管理", shortLabel: "員工", icon: UserCog, roles: ["admin", "manager"] },
  { href: "/closing", label: "日結 / 班結", shortLabel: "日結", icon: Wallet, roles: ["admin", "manager"] },
  { href: "/analytics", label: "AI 分析", shortLabel: "AI", icon: Brain, roles: ["admin", "manager"] },
];

const priorityActions = [
  { href: "/orders", label: "開單", icon: ShoppingBag, roles: ["admin", "manager", "staff"] as AuthRole[] },
  { href: "/kitchen", label: "廚房", icon: ChefHat, roles: ["admin", "manager", "kitchen"] as AuthRole[] },
  { href: "/floor-plan", label: "桌位", icon: LayoutGrid, roles: ["admin", "manager", "staff"] as AuthRole[] },
];

const pageTitleByPath: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "營運指揮中心", subtitle: "即時掌握訂單、桌況、客流與營收" },
  "/kitchen": { title: "廚房顯示系統", subtitle: "出餐節奏、待製作項目與完成狀態" },
  "/floor-plan": { title: "樓層平面圖", subtitle: "桌位狀態、入座情況與翻桌效率" },
  "/orders": { title: "訂單管理", subtitle: "點餐、加減菜、付款與訂單生命週期" },
  "/reservations": { title: "訂位管理", subtitle: "預約客人、桌位安排與到店管理" },
  "/customers": { title: "顧客管理", subtitle: "顧客資料、回訪紀錄與消費洞察" },
  "/products": { title: "菜單管理", subtitle: "商品、價格、分類與供應狀態" },
  "/inventory": { title: "庫存管理", subtitle: "原物料存量、低庫存提醒與採購判斷" },
  "/staff": { title: "員工管理", subtitle: "人員、班表、任務與角色權限" },
  "/closing": { title: "日結 / 班結", subtitle: "應收、實收、未收、退款與付款方式對帳" },
  "/analytics": { title: "AI 營運分析", subtitle: "營收趨勢、熱銷商品與決策建議" },
};

function canAccess(itemRoles: AuthRole[] | undefined, role: AuthRole | undefined) {
  return !itemRoles?.length || Boolean(role && itemRoles.includes(role));
}

function getPageMeta(location: string) {
  const exact = pageTitleByPath[location];
  if (exact) return exact;

  const match = Object.entries(pageTitleByPath)
    .filter(([path]) => path !== "/" && location.startsWith(path))
    .sort((a, b) => b[0].length - a[0].length)[0];

  return match?.[1] ?? pageTitleByPath["/"];
}

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link href={href} onClick={onClick}>
      <span
        data-testid={`nav-${label}`}
        className={cn(
          "group flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 cursor-pointer select-none",
          isActive
            ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
            : "text-sidebar-foreground/78 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-colors", isActive ? "bg-white/15" : "bg-background/70 group-hover:bg-background")}>
          <Icon className="h-4 w-4 shrink-0" />
        </span>
        <span className="truncate">{label}</span>
      </span>
    </Link>
  );
}

function LogoutButton({ onClick }: { onClick?: () => void }) {
  const logout = useLogout();

  const handleLogout = async () => {
    onClick?.();
    await logout();
  };

  return (
    <button
      data-testid="button-logout"
      onClick={handleLogout}
      className="w-full flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold transition-all duration-200 cursor-pointer select-none text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-background/70">
        <LogOut className="h-4 w-4 shrink-0" />
      </span>
      登出
    </button>
  );
}

function StatusPill() {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
      </span>
      系統運作中
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location] = useLocation();
  const currentUser = getCurrentUser();
  const pageMeta = getPageMeta(location);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => canAccess(item.roles, currentUser?.role)),
    [currentUser?.role],
  );

  const visiblePriorityActions = useMemo(
    () => priorityActions.filter((item) => canAccess(item.roles, currentUser?.role)),
    [currentUser?.role],
  );

  const mobileTabs = visibleNavItems.filter((item) => ["/", "/orders", "/kitchen", "/floor-plan", "/closing"].includes(item.href)).slice(0, 5);

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="border-b border-sidebar-border px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/25">
            <ChefHat className="h-5 w-5 text-primary-foreground" />
            <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-sidebar bg-emerald-500" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-black tracking-tight text-sidebar-foreground">Restaurant OS</p>
            <p className="truncate text-xs font-medium text-muted-foreground">AI Operating Core</p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sidebar-border bg-background/60 p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-sidebar-foreground">{currentUser?.name ?? "營運帳號"}</p>
              <p className="truncate text-[11px] text-muted-foreground">{currentUser?.role ?? "operator"}</p>
            </div>
            <Sparkles className="h-4 w-4 shrink-0 text-primary" />
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {visibleNavItems.map((item) => (
          <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-3 py-3 space-y-2">
        <div className="rounded-2xl border border-sidebar-border bg-background/60 px-3 py-3">
          <div className="flex items-center gap-2 text-xs font-bold text-sidebar-foreground">
            <Radio className="h-3.5 w-3.5 text-emerald-500" />
            營運監控
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">即時訂單、桌況與廚房狀態已連線。</p>
        </div>
        <LogoutButton onClick={() => setMobileOpen(false)} />
        <p className="px-3 pb-1 text-[11px] text-muted-foreground">v1.1.0 · production</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,hsl(var(--primary)/0.08),transparent_34%),hsl(var(--background))]">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar/95 backdrop-blur lg:flex">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 h-full w-[82vw] max-w-80 border-r border-sidebar-border bg-sidebar shadow-2xl">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 border-b border-border/80 bg-background/88 px-4 py-3 backdrop-blur-xl lg:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                data-testid="button-mobile-menu"
                onClick={() => setMobileOpen(!mobileOpen)}
                className="rounded-2xl border border-border bg-card p-2 shadow-sm transition-colors hover:bg-muted lg:hidden"
                aria-label="開啟選單"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h1 className="truncate text-base font-black tracking-tight text-foreground sm:text-lg">{pageMeta.title}</h1>
                  <div className="hidden sm:block"><StatusPill /></div>
                </div>
                <p className="hidden truncate text-xs text-muted-foreground sm:block">{pageMeta.subtitle}</p>
              </div>
            </div>

            <div className="hidden items-center gap-2 md:flex">
              {visiblePriorityActions.map((action) => {
                const Icon = action.icon;
                return (
                  <Link key={action.href} href={action.href}>
                    <span className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-3 py-2 text-xs font-bold text-foreground shadow-sm transition-all hover:-translate-y-0.5 hover:bg-muted hover:shadow-md">
                      <Icon className="h-3.5 w-3.5 text-primary" />
                      {action.label}
                    </span>
                  </Link>
                );
              })}
              <Link href="/analytics">
                <span className="inline-flex items-center gap-2 rounded-2xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground shadow-md shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  AI 分析
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto pb-24 lg:pb-0">
          {children}
        </main>

        {mobileTabs.length > 0 && (
          <nav className="fixed inset-x-3 bottom-3 z-30 rounded-3xl border border-border bg-card/95 px-2 py-2 shadow-2xl backdrop-blur-xl lg:hidden">
            <div className="grid grid-cols-5 gap-1">
              {mobileTabs.map((item) => {
                const Icon = item.icon;
                const isActive = item.href === "/" ? location === "/" : location.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}>
                    <span className={cn(
                      "flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[11px] font-bold transition-all",
                      isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}>
                      <Icon className="h-4 w-4" />
                      <span className="truncate">{item.shortLabel ?? item.label}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}
