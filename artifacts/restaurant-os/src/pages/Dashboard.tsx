import { useGetDashboardSummary, useGetTopProducts, useGetCustomerFlow, useGetRecentActivity } from "@workspace/api-client-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, ShoppingBag, Users, RefreshCw, Clock, CalendarDays, DollarSign, Activity } from "lucide-react";
import { cn } from "@/lib/utils";

function KPICard({ title, value, sub, icon: Icon, accent }: { title: string; value: string; sub?: string; icon: React.ElementType; accent?: string }) {
  return (
    <div data-testid={`kpi-${title}`} className="bg-card border border-card-border rounded-xl p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
        <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", accent ?? "bg-primary/10")}>
          <Icon className={cn("h-4 w-4", accent ? "text-white" : "text-primary")} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  order: "訂單",
  reservation: "訂位",
  customer: "顧客",
};

function ActivityBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    order: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    reservation: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    customer: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  };
  return (
    <span className={cn("text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded", styles[type] ?? "bg-muted text-muted-foreground")}>
      {ACTIVITY_TYPE_LABELS[type] ?? type}
    </span>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: topProducts, isLoading: productsLoading } = useGetTopProducts();
  const { data: flow, isLoading: flowLoading } = useGetCustomerFlow();
  const { data: activity, isLoading: activityLoading } = useGetRecentActivity();

  const today = new Date().toLocaleDateString("zh-TW", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">儀表板</h1>
        <p className="text-sm text-muted-foreground mt-0.5">{today}</p>
      </div>

      {summaryLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-xl p-5 h-28 animate-pulse" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="今日營業額" value={`$${summary.todaySales.toFixed(2)}`} sub={`本週 $${summary.weekSales.toFixed(2)}`} icon={DollarSign} accent="bg-primary" />
          <KPICard title="今日訂單" value={String(summary.todayOrders)} sub={`${summary.pendingOrders} 筆待處理`} icon={ShoppingBag} />
          <KPICard title="今日顧客" value={String(summary.todayCustomers)} sub="不重複訪客" icon={Users} />
          <KPICard title="回客率" value={`${summary.repeatCustomerRate.toFixed(1)}%`} sub="回頭客比例" icon={RefreshCw} />
          <KPICard title="待處理訂單" value={String(summary.pendingOrders)} icon={Clock} />
          <KPICard title="訂位數" value={String(summary.activeReservations)} sub="今日有效訂位" icon={CalendarDays} />
          <KPICard title="本週營收" value={`$${summary.weekSales.toFixed(0)}`} icon={TrendingUp} />
          <KPICard title="系統狀態" value="運作中" sub="即時數據" icon={Activity} />
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">今日客流量</h2>
          {flowLoading ? (
            <div className="h-48 animate-pulse bg-muted rounded-lg" />
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={flow ?? []} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(15 80% 50%)" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(15 80% 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                <Tooltip contentStyle={{ borderRadius: "8px", fontSize: "12px" }} formatter={(v) => [v, "顧客數"]} />
                <Area type="monotone" dataKey="customers" stroke="hsl(15 80% 50%)" fill="url(#flowGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="lg:col-span-2 bg-card border border-card-border rounded-xl p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">熱銷商品</h2>
          {productsLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 bg-muted animate-pulse rounded" />)}
            </div>
          ) : (
            <div className="space-y-2.5">
              {(topProducts ?? []).slice(0, 6).map((p, i) => (
                <div key={p.productId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{p.productName}</p>
                    <p className="text-[10px] text-muted-foreground">已售 {p.totalSold} 份</p>
                  </div>
                  <span className="text-xs font-semibold text-foreground shrink-0">${p.totalRevenue.toFixed(0)}</span>
                </div>
              ))}
              {(!topProducts || topProducts.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-8">尚無銷售資料</p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">最近動態</h2>
        {activityLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-10 bg-muted animate-pulse rounded" />)}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {(activity ?? []).map((item) => (
              <div key={item.id} data-testid={`activity-${item.id}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <ActivityBadge type={item.type} />
                <p className="flex-1 text-sm text-foreground">{item.description}</p>
                {item.amount != null && (
                  <span className="text-sm font-semibold text-foreground shrink-0">${item.amount.toFixed(2)}</span>
                )}
                <span className="text-xs text-muted-foreground shrink-0">
                  {new Date(item.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))}
            {(!activity || activity.length === 0) && (
              <p className="text-sm text-muted-foreground py-6 text-center">尚無最近動態</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
