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
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { useLogout } from "@/hooks/use-auth";

const navItems = [
  { href: "/", label: "儀表板", icon: LayoutDashboard },
  { href: "/floor-plan", label: "樓層平面圖", icon: LayoutGrid },
  { href: "/customers", label: "顧客管理", icon: Users },
  { href: "/reservations", label: "訂位管理", icon: CalendarDays },
  { href: "/orders", label: "訂單管理", icon: ShoppingBag },
  { href: "/staff", label: "員工管理", icon: UserCog },
  { href: "/products", label: "菜單管理", icon: UtensilsCrossed },
];

function NavLink({ href, label, icon: Icon, onClick }: { href: string; label: string; icon: React.ElementType; onClick?: () => void }) {
  const [location] = useLocation();
  const isActive = href === "/" ? location === "/" : location.startsWith(href);
  return (
    <Link href={href} onClick={onClick}>
      <span
        data-testid={`nav-${label}`}
        className={cn(
          "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none",
          isActive
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {label}
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
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer select-none text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
    >
      <LogOut className="h-4 w-4 shrink-0" />
      登出
    </button>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
          <ChefHat className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="text-sm font-bold text-sidebar-foreground leading-tight">餐廳管理系統</p>
          <p className="text-xs text-muted-foreground">營運管理平台</p>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.href} {...item} onClick={() => setMobileOpen(false)} />
        ))}
      </nav>
      <div className="px-3 py-3 border-t border-sidebar-border space-y-1">
        <LogoutButton onClick={() => setMobileOpen(false)} />
        <p className="text-xs text-muted-foreground px-3 pb-1">v1.0.0 &mdash; 今日班次</p>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      <aside className="hidden lg:flex w-60 flex-col bg-sidebar border-r border-sidebar-border shrink-0">
        {sidebar}
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative z-50 w-60 h-full bg-sidebar border-r border-sidebar-border flex flex-col">
            {sidebar}
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="lg:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <ChefHat className="h-3.5 w-3.5 text-primary-foreground" />
            </div>
            <span className="text-sm font-bold">餐廳管理系統</span>
          </div>
          <button
            data-testid="button-mobile-menu"
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-1.5 rounded-md hover:bg-muted transition-colors"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
