import { Link } from "wouter";
import {
  useGetDashboardSummary,
  useGetTopProducts,
  useGetCustomerFlow,
  useGetRecentActivity,
} from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  ShoppingBag,
  Users,
  RefreshCw,
  Clock,
  CalendarDays,
  DollarSign,
  Activity,
  ChefHat,
  LayoutGrid,
  ArrowUpRight,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Timer,
} from "lucide-react";
import { cn } from "@/lib/utils";

function formatCurrency(value: number, fractionDigits = 0) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: fractionDigits,
  }).format(value);
}

function KPICard({
  title,
  value,
  sub,
  icon: Icon,
  accent,
  tone = "default",
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  accent?: string;
  tone?: "default" | "success" | "warning" | "primary";
}) {
  const toneClasses = {
    default: "bg-card",
    success: "bg-emerald-500/5 border-emerald-500/20",
    warning: "bg-amber-500/5 border-amber-500/25",
    primary: "bg-primary/5 border-primary/20",
  }[tone];

  return (
    <div
      data-testid={`kpi-${title}`}
      className={cn(
        "group relative overflow-hidden rounded-3xl border border-card-border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        toneClasses,
      )}
    >
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-primary/8 blur-2xl transition-opacity group-hover:opacity-90" />
      <div className="relative flex items-center justify-between gap-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </span>
        <div
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm",
            accent ?? "bg-primary/10",
          )}
        >
          <Icon
            className={cn("h-4 w-4", accent ? "text-white" : "text-primary")}
          />
        </div>
      </div>
      <div className="relative mt-4">
        <p className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
          {value}
        </p>
        {sub && (
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {sub}
          </p>
        )}
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
    reservation:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    customer:
      "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  };
  return (
    <span
      className={cn(
        "rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider",
        styles[type] ?? "bg-muted text-muted-foreground",
      )}
    >
      {ACTIVITY_TYPE_LABELS[type] ?? type}
    </span>
  );
}

function QuickAction({
  href,
  label,
  description,
  icon: Icon,
}: {
  href: string;
  label: string;
  description: string;
  icon: React.ElementType;
}) {
  return (
    <Link href={href}>
      <span className="group flex items-center gap-3 rounded-3xl border border-border bg-card p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-black text-foreground">
            {label}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted-foreground">
            {description}
          </span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
      </span>
    </Link>
  );
}

function OperatingPulse({
  pendingOrders,
  activeReservations,
  todayOrders,
}: {
  pendingOrders: number;
  activeReservations: number;
  todayOrders: number;
}) {
  const loadLevel =
    pendingOrders >= 8 ? "busy" : pendingOrders >= 3 ? "active" : "calm";
  const label =
    loadLevel === "busy"
      ? "高峰處理中"
      : loadLevel === "active"
        ? "正常營運中"
        : "節奏穩定";
  const Icon =
    loadLevel === "busy"
      ? AlertTriangle
      : loadLevel === "active"
        ? Timer
        : CheckCircle2;

  return (
    <div className="rounded-[2rem] border border-card-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-muted-foreground">
            Operating Pulse
          </p>
          <h2 className="mt-2 text-xl font-black tracking-tight text-foreground">
            {label}
          </h2>
        </div>
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-2xl",
            loadLevel === "busy"
              ? "bg-amber-500/12 text-amber-600"
              : loadLevel === "active"
                ? "bg-primary/10 text-primary"
                : "bg-emerald-500/10 text-emerald-600",
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-muted/60 p-3 text-center">
          <p className="text-lg font-black text-foreground">{pendingOrders}</p>
          <p className="text-[11px] text-muted-foreground">待處理</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3 text-center">
          <p className="text-lg font-black text-foreground">
            {activeReservations}
          </p>
          <p className="text-[11px] text-muted-foreground">今日訂位</p>
        </div>
        <div className="rounded-2xl bg-muted/60 p-3 text-center">
          <p className="text-lg font-black text-foreground">{todayOrders}</p>
          <p className="text-[11px] text-muted-foreground">今日訂單</p>
        </div>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        {loadLevel === "busy"
          ? "廚房與前台需要優先處理待完成訂單，建議先檢查 KDS 與桌位狀態。"
          : "目前營運節奏可控，可同步檢查訂位、熱銷商品與庫存補貨。"}
      </p>
    </div>
  );
}

export default function Dashboard() {
  const {
    data: summary,
    isLoading: summaryLoading,
    error: summaryError,
  } = useGetDashboardSummary();
  const {
    data: topProducts,
    isLoading: productsLoading,
    error: productsError,
  } = useGetTopProducts();
  const {
    data: flow,
    isLoading: flowLoading,
    error: flowError,
  } = useGetCustomerFlow();
  const {
    data: activity,
    isLoading: activityLoading,
    error: activityError,
  } = useGetRecentActivity();

  const today = new Date().toLocaleDateString("zh-TW", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const hasError = summaryError || productsError || flowError || activityError;

  const pendingOrders = summary?.pendingOrders ?? 0;
  const activeReservations = summary?.activeReservations ?? 0;
  const todayOrders = summary?.todayOrders ?? 0;
  const todayReceivable = summary?.todayReceivable ?? summary?.todaySales ?? 0;
  const todayCollected = summary?.todayCollected ?? summary?.todaySales ?? 0;
  const todayOutstanding =
    summary?.todayOutstanding ?? Math.max(todayReceivable - todayCollected, 0);

  return (
    <div className="mx-auto max-w-7xl space-y-6 overflow-x-hidden p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-12 -top-24 h-56 w-56 rounded-full bg-primary/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 left-1/4 h-56 w-56 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              AI Restaurant Operating Core
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
              今天的營運，一眼看清楚。
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-base">
              {today} ·
              從訂單、桌位、廚房、客流到營收，集中在同一個指揮中心判斷下一步。
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:w-[520px]">
            <QuickAction
              href="/orders"
              label="處理訂單"
              description="開單、加菜、付款"
              icon={ShoppingBag}
            />
            <QuickAction
              href="/kitchen"
              label="看廚房"
              description="確認出餐節奏"
              icon={ChefHat}
            />
            <QuickAction
              href="/floor-plan"
              label="看桌位"
              description="安排入座翻桌"
              icon={LayoutGrid}
            />
          </div>
        </div>
      </section>

      {hasError && (
        <div className="rounded-3xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800 shadow-sm dark:bg-amber-950/30 dark:text-amber-200">
          部分營運資料暫時無法讀取；頁面仍會顯示已取得的資訊。請優先確認 API
          與登入權限狀態。
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {summaryLoading ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div
                  key={i}
                  className="h-36 animate-pulse rounded-3xl border border-card-border bg-card"
                />
              ))}
            </div>
          ) : summary ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KPICard
                title="今日應收"
                value={formatCurrency(todayReceivable)}
                sub="不含已取消訂單"
                icon={DollarSign}
                accent="bg-primary"
                tone="primary"
              />
              <KPICard
                title="今日實收"
                value={formatCurrency(todayCollected)}
                sub={`本週實收 ${formatCurrency(summary.weekSales)}`}
                icon={CheckCircle2}
                tone="success"
              />
              <KPICard
                title="今日未收"
                value={formatCurrency(todayOutstanding)}
                sub="未付款與部分付款餘額"
                icon={AlertTriangle}
                tone={todayOutstanding > 0 ? "warning" : "success"}
              />
              <KPICard
                title="今日訂單"
                value={String(summary.todayOrders)}
                sub={`${summary.pendingOrders} 筆待處理`}
                icon={ShoppingBag}
                tone={summary.pendingOrders > 0 ? "warning" : "default"}
              />
              <KPICard
                title="今日顧客"
                value={String(summary.todayCustomers)}
                sub="不重複訪客"
                icon={Users}
              />
              <KPICard
                title="回客率"
                value={`${summary.repeatCustomerRate.toFixed(1)}%`}
                sub="回頭客比例"
                icon={RefreshCw}
                tone="success"
              />
              <KPICard
                title="待處理訂單"
                value={String(summary.pendingOrders)}
                sub="前台與廚房優先處理"
                icon={Clock}
                tone={summary.pendingOrders > 0 ? "warning" : "success"}
              />
              <KPICard
                title="本週實收"
                value={formatCurrency(summary.weekSales)}
                sub="paid 全額、partial 只計已收"
                icon={TrendingUp}
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <KPICard
                title="今日營業額"
                value="$0"
                sub="資料暫不可用"
                icon={DollarSign}
                accent="bg-primary"
                tone="primary"
              />
              <KPICard
                title="今日訂單"
                value="0"
                sub="請稍後重新整理"
                icon={ShoppingBag}
              />
              <KPICard title="進行中訂單" value="0" icon={Clock} />
              <KPICard
                title="系統狀態"
                value="需注意"
                sub="API 部分失敗"
                icon={Activity}
                tone="warning"
              />
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="rounded-[2rem] border border-card-border bg-card p-5 shadow-sm lg:col-span-3">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-foreground">
                    今日客流量
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    依時段觀察尖峰與低谷
                  </p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                  Live
                </span>
              </div>
              {flowLoading ? (
                <div className="h-60 animate-pulse rounded-3xl bg-muted" />
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart
                    data={flowError ? [] : (flow ?? [])}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="5%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor="hsl(var(--primary))"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-border/50"
                    />
                    <XAxis
                      dataKey="hour"
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                    />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{
                        borderRadius: "16px",
                        fontSize: "12px",
                        border: "1px solid hsl(var(--border))",
                      }}
                      formatter={(v) => [v, "顧客數"]}
                    />
                    <Area
                      type="monotone"
                      dataKey="customers"
                      stroke="hsl(var(--primary))"
                      fill="url(#flowGrad)"
                      strokeWidth={3}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded-[2rem] border border-card-border bg-card p-5 shadow-sm lg:col-span-2">
              <div className="mb-5 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-black text-foreground">
                    熱銷商品
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    今日優先備料參考
                  </p>
                </div>
                <Link href="/products">
                  <span className="rounded-full bg-muted px-3 py-1 text-xs font-black text-foreground transition-colors hover:bg-primary hover:text-primary-foreground">
                    菜單
                  </span>
                </Link>
              </div>
              {productsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-11 animate-pulse rounded-2xl bg-muted"
                    />
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {(productsError ? [] : (topProducts ?? []))
                    .slice(0, 6)
                    .map((p, i) => (
                      <div
                        key={p.productId}
                        className="flex items-center gap-3 rounded-2xl bg-muted/45 p-3"
                      >
                        <span
                          className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-xs font-black",
                            i === 0
                              ? "bg-primary text-primary-foreground"
                              : "bg-card text-muted-foreground",
                          )}
                        >
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-foreground">
                            {p.productName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            已售 {p.totalSold} 份
                          </p>
                        </div>
                        <span className="shrink-0 text-sm font-black text-foreground">
                          {formatCurrency(p.totalRevenue)}
                        </span>
                      </div>
                    ))}
                  {(productsError ||
                    !topProducts ||
                    topProducts.length === 0) && (
                    <p className="py-10 text-center text-sm text-muted-foreground">
                      尚無銷售資料
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <OperatingPulse
            pendingOrders={pendingOrders}
            activeReservations={activeReservations}
            todayOrders={todayOrders}
          />

          <div className="rounded-[2rem] border border-card-border bg-card p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-black text-foreground">
                  最近動態
                </h2>
                <p className="text-xs text-muted-foreground">最新營運事件</p>
              </div>
              <Activity className="h-4 w-4 text-primary" />
            </div>
            {activityLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-14 animate-pulse rounded-2xl bg-muted"
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {(activity ?? []).slice(0, 7).map((item) => (
                  <div
                    key={item.id}
                    data-testid={`activity-${item.id}`}
                    className="rounded-2xl border border-border/70 bg-muted/25 p-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <ActivityBadge type={item.type} />
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {new Date(item.createdAt).toLocaleTimeString("zh-TW", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-foreground">
                      {item.description}
                    </p>
                    {item.amount != null && (
                      <p className="mt-1 text-sm font-black text-primary">
                        {formatCurrency(item.amount)}
                      </p>
                    )}
                  </div>
                ))}
                {(activityError || !activity || activity.length === 0) && (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    尚無最近動態
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
