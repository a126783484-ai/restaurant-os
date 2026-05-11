import { useEffect, useState } from "react";
import { useListOrders, useGetOrder, useUpdateOrder, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { Clock, RefreshCw, ChefHat } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_SEQUENCE = ["pending", "preparing", "ready", "completed"] as const;
const STATUS_NEXT: Record<string, string> = {
  pending: "preparing",
  preparing: "ready",
  ready: "completed",
};
const STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  preparing: "準備中",
  ready: "已備妥",
};
const STATUS_COLORS: Record<string, { card: string; badge: string; btn: string }> = {
  pending: {
    card: "border-amber-400 bg-amber-50 dark:bg-amber-950/30",
    badge: "bg-amber-500 text-white",
    btn: "bg-amber-500 hover:bg-amber-600 text-white",
  },
  preparing: {
    card: "border-blue-400 bg-blue-50 dark:bg-blue-950/30",
    badge: "bg-blue-500 text-white",
    btn: "bg-blue-500 hover:bg-blue-600 text-white",
  },
  ready: {
    card: "border-green-400 bg-green-50 dark:bg-green-950/30",
    badge: "bg-green-500 text-white",
    btn: "bg-green-500 hover:bg-green-600 text-white",
  },
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

function ElapsedTime({ createdAt }: { createdAt: string }) {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000)
  );
  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000));
    }, 30000);
    return () => clearInterval(id);
  }, [createdAt]);
  return (
    <span className={cn("text-xs font-semibold flex items-center gap-1", elapsed > 15 ? "text-red-500" : "text-muted-foreground")}>
      <Clock className="h-3 w-3" />
      {elapsed < 1 ? "剛建立" : `${elapsed} 分鐘前`}
    </span>
  );
}

function KDSCard({ orderId, onAdvance }: { orderId: number; onAdvance: () => void }) {
  const { data: order } = useGetOrder(orderId);
  const updateOrder = useUpdateOrder();
  const queryClient = useQueryClient();

  if (!order) return null;
  const cfg = STATUS_COLORS[order.status];
  if (!cfg) return null;

  const handleAdvance = () => {
    const next = STATUS_NEXT[order.status];
    if (!next) return;
    updateOrder.mutate(
      { id: order.id, data: { status: next } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          if (next === "completed") onAdvance();
        },
      }
    );
  };

  return (
    <div className={cn("rounded-xl border-2 p-4 flex flex-col gap-3 transition-all duration-300", cfg.card)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-black text-foreground">#{order.id}</span>
            <span className={cn("text-[11px] font-bold px-2 py-0.5 rounded-full", cfg.badge)}>
              {STATUS_LABELS[order.status]}
            </span>
            <span className="text-xs text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
              {ORDER_TYPE_LABELS[order.type] ?? order.type}
              {order.tableId ? ` · ${order.tableId} 桌` : ""}
            </span>
          </div>
          <ElapsedTime createdAt={order.createdAt} />
        </div>
        <span className="text-sm font-bold text-foreground shrink-0">${order.totalAmount.toFixed(0)}</span>
      </div>

      <div className="divide-y divide-border/60 rounded-lg overflow-hidden bg-white/60 dark:bg-black/20">
        {order.items?.map((item) => (
          <div key={item.id} className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold text-foreground">{item.productName}</span>
            <span className="text-base font-black text-foreground ml-2">×{item.quantity}</span>
          </div>
        ))}
      </div>

      {order.notes && (
        <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/40 rounded px-2 py-1">
          備註：{order.notes}
        </p>
      )}

      {STATUS_NEXT[order.status] && (
        <button
          onClick={handleAdvance}
          disabled={updateOrder.isPending}
          className={cn("w-full py-2.5 rounded-lg text-sm font-bold transition-colors disabled:opacity-60", cfg.btn)}
        >
          {updateOrder.isPending ? "更新中…" : order.status === "pending" ? "開始備餐 →" : order.status === "preparing" ? "出餐完成 ✓" : "完成 ✓"}
        </button>
      )}
    </div>
  );
}

function Column({ title, badge, orderIds, onAdvance }: { title: string; badge: string; orderIds: number[]; onAdvance: () => void }) {
  return (
    <div className="flex flex-col gap-4 min-w-0">
      <div className="flex items-center gap-2 sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10">
        <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">{title}</h2>
        {orderIds.length > 0 && (
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full text-white", badge)}>
            {orderIds.length}
          </span>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {orderIds.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-border bg-muted/20 p-8 text-center">
            <p className="text-sm text-muted-foreground">無訂單</p>
          </div>
        ) : (
          orderIds.map(id => <KDSCard key={id} orderId={id} onAdvance={onAdvance} />)
        )}
      </div>
    </div>
  );
}

export default function KitchenDisplay() {
  const queryClient = useQueryClient();
  const { data: pending } = useListOrders({ status: "pending" });
  const { data: preparing } = useListOrders({ status: "preparing" });
  const { data: ready } = useListOrders({ status: "ready" });
  const [lastRefresh, setLastRefresh] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
      setLastRefresh(new Date());
    }, 30000);
    return () => clearInterval(id);
  }, [queryClient]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    setLastRefresh(new Date());
  };

  const pendingIds = (pending ?? []).map(o => o.id);
  const preparingIds = (preparing ?? []).map(o => o.id);
  const readyIds = (ready ?? []).map(o => o.id);
  const total = pendingIds.length + preparingIds.length + readyIds.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-6 py-4 border-b border-border bg-background/90 backdrop-blur-sm shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <ChefHat className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">廚房顯示系統</h1>
              <p className="text-xs text-muted-foreground">
                進行中 {total} 筆 · 更新於 {lastRefresh.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> 重新整理
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          <Column title="待處理" badge="bg-amber-500" orderIds={pendingIds} onAdvance={refresh} />
          <Column title="準備中" badge="bg-blue-500" orderIds={preparingIds} onAdvance={refresh} />
          <Column title="已備妥" badge="bg-green-500" orderIds={readyIds} onAdvance={refresh} />
        </div>
      </div>
    </div>
  );
}
