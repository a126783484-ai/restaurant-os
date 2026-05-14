import { useEffect, useState } from "react";
import {
  useListOrders,
  useGetOrder,
  useUpdateOrder,
  getGetDashboardSummaryQueryKey,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChefHat,
  Clock,
  Radio,
  RefreshCw,
  Utensils,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_NEXT: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  preparing: "製作中",
  ready: "可出餐",
};

const STATUS_ACTION_LABELS: Record<string, string> = {
  pending: "開始製作",
  preparing: "標記可出餐",
  ready: "完成出餐",
};

const STATUS_COLORS: Record<
  string,
  { card: string; badge: string; btn: string }
> = {
  pending: {
    card: "border-amber-300 bg-amber-50/90 dark:border-amber-500/30 dark:bg-amber-950/20",
    badge: "bg-amber-500 text-white",
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  preparing: {
    card: "border-blue-300 bg-blue-50/90 dark:border-blue-500/30 dark:bg-blue-950/20",
    badge: "bg-blue-500 text-white",
    btn: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  ready: {
    card: "border-emerald-300 bg-emerald-50/90 dark:border-emerald-500/30 dark:bg-emerald-950/20",
    badge: "bg-emerald-500 text-white",
    btn: "bg-emerald-500 hover:bg-emerald-600 text-white",
  },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

function elapsedMinutes(createdAt: string) {
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000),
  );
}

function ElapsedTime({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() => elapsedMinutes(createdAt));

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(elapsedMinutes(createdAt));
    }, 30000);
    return () => clearInterval(id);
  }, [createdAt]);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-black",
        elapsed >= 20
          ? "bg-red-500 text-white"
          : elapsed >= 12
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
            : "bg-background/70 text-muted-foreground",
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {elapsed < 1 ? "剛建立" : `${elapsed} 分鐘`}
    </span>
  );
}

function KDSCard({
  orderId,
  onAdvance,
}: {
  orderId: number;
  onAdvance: () => void;
}) {
  const { data: order } = useGetOrder(orderId);
  const updateOrder = useUpdateOrder();
  const queryClient = useQueryClient();

  if (!order) return null;
  const cfg = STATUS_COLORS[order.status];
  if (!cfg) return null;

  const next = STATUS_NEXT[order.status];
  const itemCount =
    order.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0;

  const handleAdvance = () => {
    if (!next) return;
    updateOrder.mutate(
      { id: order.id, data: { status: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          queryClient.invalidateQueries({
            queryKey: getGetOrderQueryKey(order.id),
          });
          queryClient.invalidateQueries({
            queryKey: getGetDashboardSummaryQueryKey(),
          });
          onAdvance();
        },
      },
    );
  };

  return (
    <div
      className={cn(
        "rounded-[1.75rem] border-2 p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
        cfg.card,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-black tracking-tight text-foreground">
              #{order.id}
            </span>
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-black",
                cfg.badge,
              )}
            >
              {STATUS_LABELS[order.status]}
            </span>
            <span className="rounded-full bg-background/75 px-2.5 py-1 text-xs font-bold text-muted-foreground">
              {ORDER_TYPE_LABELS[order.type] ?? order.type}
              {order.tableId ? ` · ${order.tableId} 桌` : ""}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <ElapsedTime createdAt={order.createdAt} />
            <span className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-2.5 py-1 text-xs font-black text-muted-foreground">
              <Utensils className="h-3.5 w-3.5" /> {itemCount} 份
            </span>
          </div>
        </div>
        <span className="text-lg font-black text-foreground shrink-0">
          ${order.totalAmount.toFixed(0)}
        </span>
      </div>

      <div className="mt-4 divide-y divide-border/60 overflow-hidden rounded-2xl border border-white/60 bg-white/70 dark:border-white/10 dark:bg-black/25">
        {order.items?.length ? (
          order.items.map((item) => (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 px-3 py-3"
            >
              <span className="truncate text-base font-black text-foreground">
                {item.productName}
              </span>
              <span className="flex min-h-10 min-w-10 shrink-0 items-center justify-center rounded-xl bg-foreground px-2 text-lg font-black text-background">
                ×{item.quantity}
              </span>
            </div>
          ))
        ) : (
          <div className="px-3 py-6 text-center text-sm font-medium text-muted-foreground">
            此訂單尚無品項資料
          </div>
        )}
      </div>

      {order.notes && (
        <p className="mt-3 rounded-2xl border border-amber-300/70 bg-amber-100/80 px-3 py-2 text-sm font-bold text-amber-800 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
          備註：{order.notes}
        </p>
      )}

      {next && (
        <button
          onClick={handleAdvance}
          disabled={updateOrder.isPending}
          className={cn(
            "mt-4 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition-colors disabled:opacity-60",
            cfg.btn,
          )}
        >
          {updateOrder.isPending
            ? "更新中…"
            : STATUS_ACTION_LABELS[order.status]}
          {!updateOrder.isPending && <ArrowRight className="h-4 w-4" />}
        </button>
      )}
    </div>
  );
}

function Column({
  title,
  subtitle,
  badge,
  orderIds,
  onAdvance,
}: {
  title: string;
  subtitle: string;
  badge: string;
  orderIds: number[];
  onAdvance: () => void;
}) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="sticky top-0 z-10 rounded-3xl border border-border bg-background/90 px-4 py-3 shadow-sm backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black tracking-tight text-foreground">
              {title}
            </h2>
            <p className="text-xs text-muted-foreground">{subtitle}</p>
          </div>
          <span
            className={cn(
              "flex h-9 min-w-9 items-center justify-center rounded-2xl px-3 text-sm font-black text-white",
              badge,
            )}
          >
            {orderIds.length}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {orderIds.length === 0 ? (
          <div className="rounded-[1.75rem] border-2 border-dashed border-border bg-card/60 p-8 text-center shadow-sm">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-bold text-foreground">目前清空</p>
            <p className="mt-1 text-xs text-muted-foreground">
              沒有需要處理的訂單
            </p>
          </div>
        ) : (
          orderIds.map((id) => (
            <KDSCard key={id} orderId={id} onAdvance={onAdvance} />
          ))
        )}
      </div>
    </div>
  );
}

export default function KitchenDisplay() {
  const queryClient = useQueryClient();
  const {
    data: pending,
    isLoading: pendingLoading,
    error: pendingError,
  } = useListOrders({ status: "pending" });
  const {
    data: preparing,
    isLoading: preparingLoading,
    error: preparingError,
  } = useListOrders({ status: "preparing" });
  const {
    data: ready,
    isLoading: readyLoading,
    error: readyError,
  } = useListOrders({ status: "ready" });
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      queryClient.invalidateQueries({
        queryKey: getGetDashboardSummaryQueryKey(),
      });
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, [queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getGetDashboardSummaryQueryKey(),
    });
    setLastRefresh(new Date());
  };

  const pendingIds = (pending ?? []).map((o) => o.id);
  const preparingIds = (preparing ?? []).map((o) => o.id);
  const readyIds = (ready ?? []).map((o) => o.id);
  const total = pendingIds.length + preparingIds.length + readyIds.length;
  const loading = pendingLoading || preparingLoading || readyLoading;
  const error = pendingError || preparingError || readyError;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-4 sm:px-6 py-4 border-b border-border bg-background/90 backdrop-blur-xl shrink-0">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex h-12 w-12 items-center justify-center rounded-3xl bg-orange-500 shadow-lg shadow-orange-500/25">
              <ChefHat className="h-6 w-6 text-white" />
              <span className="absolute -right-1 -top-1 h-4 w-4 rounded-full border-2 border-background bg-emerald-500" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-black tracking-tight text-foreground">
                  廚房出餐指揮台
                </h1>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-black text-emerald-700 dark:text-emerald-300">
                  <Radio className="h-3 w-3" /> Live
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                進行中 {total} 筆 · 更新於{" "}
                {lastRefresh.toLocaleTimeString("zh-TW", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refresh}
            className="gap-1.5 min-h-11 rounded-2xl self-start lg:self-auto"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重新整理
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-7xl">
          {error && (
            <div className="mb-4 rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
              <AlertTriangle className="mr-2 inline h-4 w-4" /> KDS
              暫時無法讀取訂單，請重新整理。
            </div>
          )}
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="h-64 rounded-[1.75rem] bg-muted animate-pulse"
                />
              ))}
            </div>
          ) : total === 0 ? (
            <div className="rounded-[2rem] border border-border bg-card p-10 text-center shadow-sm">
              <ChefHat className="mx-auto h-10 w-10 text-primary" />
              <h2 className="mt-4 text-xl font-black text-foreground">
                廚房目前沒有待處理訂單
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                新訂單建立後會自動出現在這裡，每 30 秒同步一次。
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Column
                title="待處理"
                subtitle="新進訂單，等待開始製作"
                badge="bg-amber-500"
                orderIds={pendingIds}
                onAdvance={refresh}
              />
              <Column
                title="製作中"
                subtitle="廚房正在處理"
                badge="bg-blue-500"
                orderIds={preparingIds}
                onAdvance={refresh}
              />
              <Column
                title="可出餐"
                subtitle="等待送餐或取餐"
                badge="bg-emerald-500"
                orderIds={readyIds}
                onAdvance={refresh}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
