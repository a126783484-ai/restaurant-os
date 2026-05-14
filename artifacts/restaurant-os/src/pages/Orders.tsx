import { useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  useListOrders,
  useCreateOrder,
  useListProducts,
  useListTables,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Plus,
  ShoppingBag,
  ChevronRight,
  Minus,
  Clock,
  DollarSign,
  ChefHat,
  CheckCircle2,
  Filter,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  preparing: "準備中",
  ready: "已備妥",
  completed: "已完成",
  cancelled: "已取消",
};

const PAY_STATUS_LABELS: Record<string, string> = {
  unpaid: "未付款",
  partially_paid: "部分付款",
  paid: "已付款",
  refunded: "已退款",
  cancelled: "已取消",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  preparing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  partially_paid:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  refunded:
    "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  cancelled: "bg-muted text-muted-foreground",
};

interface OrderFormValues {
  type: string;
  tableId: string;
  notes: string;
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function StatCard({
  label,
  value,
  icon: Icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ElementType;
  tone?: "default" | "warning" | "success" | "primary";
}) {
  const toneClass = {
    default: "bg-card",
    warning: "bg-amber-500/5 border-amber-500/20",
    success: "bg-emerald-500/5 border-emerald-500/20",
    primary: "bg-primary/5 border-primary/20",
  }[tone];

  return (
    <div
      className={cn(
        "rounded-3xl border border-card-border p-4 shadow-sm",
        toneClass,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 text-xl font-black text-foreground">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </div>
  );
}

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [orderItems, setOrderItems] = useState<
    { productId: number; name: string; price: number; quantity: number }[]
  >([]);
  const idempotencyRef = useRef<string>(crypto.randomUUID());

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const orderStatusForApi = [
    "pending",
    "preparing",
    "ready",
    "completed",
    "cancelled",
  ].includes(statusFilter)
    ? statusFilter
    : undefined;
  const {
    data: orders,
    isLoading,
    error,
  } = useListOrders({
    status: orderStatusForApi,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });
  const { data: products } = useListProducts();
  const { data: tables } = useListTables();
  const createOrder = useCreateOrder();

  const { register, handleSubmit, control, reset } = useForm<OrderFormValues>({
    defaultValues: { type: "dine-in", tableId: "__none__", notes: "" },
  });

  const displayedOrders = useMemo(() => {
    const list = orders ?? [];
    if (statusFilter === "all") return list;
    if (statusFilter === "unpaid")
      return list.filter(
        (order) =>
          order.paymentStatus === "unpaid" && order.status !== "cancelled",
      );
    if (statusFilter === "partially_paid")
      return list.filter(
        (order) =>
          order.paymentStatus === "partially_paid" &&
          order.status !== "cancelled",
      );
    if (statusFilter === "paid")
      return list.filter(
        (order) =>
          order.paymentStatus === "paid" && order.status !== "cancelled",
      );
    if (statusFilter === "active")
      return list.filter((order) =>
        ["pending", "preparing", "ready"].includes(order.status),
      );
    if (statusFilter === "cancelled")
      return list.filter(
        (order) =>
          order.status === "cancelled" || order.paymentStatus === "cancelled",
      );
    return list;
  }, [orders, statusFilter]);

  const stats = useMemo(() => {
    const list = displayedOrders;
    return {
      total: list.length,
      active: list.filter((o) =>
        ["pending", "preparing", "ready"].includes(o.status),
      ).length,
      unpaid: list.filter(
        (o) => o.paymentStatus !== "paid" && o.status !== "cancelled",
      ).length,
      revenue: list.reduce(
        (sum, o) => sum + (o.status === "cancelled" ? 0 : o.totalAmount),
        0,
      ),
    };
  }, [displayedOrders]);

  const addItem = (productId: number) => {
    const product = products?.find((p) => p.id === productId);
    if (!product) return;
    setOrderItems((prev) => {
      const existing = prev.find((i) => i.productId === productId);
      if (existing)
        return prev.map((i) =>
          i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i,
        );
      return [
        ...prev,
        { productId, name: product.name, price: product.price, quantity: 1 },
      ];
    });
  };

  const removeItem = (productId: number) => {
    setOrderItems((prev) =>
      prev.flatMap((i) =>
        i.productId === productId
          ? i.quantity > 1
            ? [{ ...i, quantity: i.quantity - 1 }]
            : []
          : [i],
      ),
    );
  };

  const total = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const closeCreateDialog = () => {
    setShowCreate(false);
    setOrderItems([]);
    reset();
  };

  const onSubmit = (data: OrderFormValues) => {
    if (orderItems.length === 0) {
      toast({ title: "請至少新增一項商品", variant: "destructive" });
      return;
    }
    createOrder.mutate(
      {
        data: {
          type: data.type,
          tableId:
            data.tableId && data.tableId !== "__none__"
              ? Number(data.tableId)
              : undefined,
          notes: data.notes || undefined,
          idempotencyKey: idempotencyRef.current,
          items: orderItems.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
          })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          closeCreateDialog();
          idempotencyRef.current = crypto.randomUUID();
          toast({ title: "訂單已建立" });
        },
        onError: () =>
          toast({
            title: "建立訂單失敗",
            description: "請檢查品項或稍後再試。",
            variant: "destructive",
          }),
      },
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 overflow-x-hidden p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <ShoppingBag className="h-3.5 w-3.5" /> Order Command
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
              訂單管理
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              現場開單、狀態追蹤、付款檢查與訂單明細入口。
            </p>
          </div>
          <Button
            data-testid="button-new-order"
            onClick={() => setShowCreate(true)}
            className="min-h-12 rounded-2xl gap-2 px-5 text-sm font-black"
          >
            <Plus className="h-4 w-4" /> 新增訂單
          </Button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="目前筆數"
          value={isLoading ? "—" : String(stats.total)}
          icon={ShoppingBag}
          tone="primary"
        />
        <StatCard
          label="進行中"
          value={isLoading ? "—" : String(stats.active)}
          icon={ChefHat}
          tone={stats.active > 0 ? "warning" : "success"}
        />
        <StatCard
          label="未結清"
          value={isLoading ? "—" : String(stats.unpaid)}
          icon={Clock}
          tone={stats.unpaid > 0 ? "warning" : "success"}
        />
        <StatCard
          label="篩選金額"
          value={isLoading ? "—" : formatCurrency(stats.revenue)}
          icon={DollarSign}
        />
      </div>

      <div className="rounded-3xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-black text-foreground">
            <Filter className="h-4 w-4 text-primary" /> 快速篩選
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger
                data-testid="select-order-status"
                className="min-h-11 w-full rounded-2xl sm:w-40"
              >
                <SelectValue placeholder="所有狀態" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有訂單</SelectItem>
                <SelectItem value="unpaid">未付款</SelectItem>
                <SelectItem value="partially_paid">部分付款</SelectItem>
                <SelectItem value="paid">已付款</SelectItem>
                <SelectItem value="active">進行中訂單</SelectItem>
                <SelectItem value="cancelled">已取消</SelectItem>
                {Object.entries(ORDER_STATUS_LABELS)
                  .filter(([val]) => val !== "cancelled")
                  .map(([val, label]) => (
                    <SelectItem key={val} value={val}>
                      訂單：{label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger
                data-testid="select-order-type"
                className="min-h-11 w-full rounded-2xl sm:w-40"
              >
                <SelectValue placeholder="所有類型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有類型</SelectItem>
                <SelectItem value="dine-in">內用</SelectItem>
                <SelectItem value="takeout">外帶</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive">
          訂單 API 暫時無法讀取，請重新整理或稍後再試。
        </div>
      )}

      <div className="hidden overflow-hidden rounded-3xl border border-card-border bg-card shadow-sm md:block">
        <div className="flex items-center gap-3 border-b border-border bg-muted/40 px-5 py-3 text-xs font-black uppercase tracking-wider text-muted-foreground">
          <span className="w-16">訂單</span>
          <span className="flex-1">類型 / 時間</span>
          <span className="w-24">狀態</span>
          <span className="w-24">付款</span>
          <span className="w-24 text-right">合計</span>
          <span className="w-24 text-right">已收</span>
          <span className="w-24 text-right">餘額</span>
          <span className="w-32 text-right">入口</span>
        </div>
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="m-2 h-16 animate-pulse rounded-2xl bg-muted/40"
              />
            ))}
          </div>
        ) : displayedOrders.length > 0 ? (
          displayedOrders.map((order) => {
            const paidAmount =
              order.paidAmount ??
              (order.paymentStatus === "paid" ? order.totalAmount : 0);
            const balance = Math.max(order.totalAmount - paidAmount, 0);
            return (
              <div
                key={order.id}
                data-testid={`row-order-${order.id}`}
                className="flex items-center gap-3 border-b border-border px-5 py-4 transition-colors last:border-b-0 hover:bg-muted/50"
              >
                <span className="w-16 font-mono text-sm font-black text-muted-foreground">
                  #{order.id}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-black text-foreground">
                    {ORDER_TYPE_LABELS[order.type] ?? order.type}
                    {order.tableId ? ` · ${order.tableId} 桌` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(order.createdAt).toLocaleString("zh-TW", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Badge
                  className={cn(
                    "w-24 border-0 text-center text-[10px]",
                    ORDER_STATUS_COLORS[order.status] ??
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
                <Badge
                  className={cn(
                    "w-24 border-0 text-center text-[10px]",
                    PAY_STATUS_COLORS[order.paymentStatus] ??
                      "bg-muted text-muted-foreground",
                  )}
                >
                  {PAY_STATUS_LABELS[order.paymentStatus] ??
                    order.paymentStatus}
                </Badge>
                <span className="w-24 text-right text-sm font-black text-foreground">
                  ${order.totalAmount.toFixed(2)}
                </span>
                <span className="w-24 text-right text-sm font-black text-emerald-600">
                  ${paidAmount.toFixed(2)}
                </span>
                <span
                  className={cn(
                    "w-24 text-right text-sm font-black",
                    balance > 0 ? "text-red-600" : "text-muted-foreground",
                  )}
                >
                  ${balance.toFixed(2)}
                </span>
                <div className="flex w-32 justify-end gap-2">
                  <Link href={`/orders/${order.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl px-3"
                    >
                      明細
                    </Button>
                  </Link>
                  <Link href={`/orders/${order.id}/receipt`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 rounded-xl px-3"
                    >
                      <ReceiptText className="h-3.5 w-3.5" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="py-16 text-center">
            <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-black text-foreground">找不到訂單</p>
            <p className="mt-1 text-xs text-muted-foreground">
              建立新訂單以開始使用
            </p>
          </div>
        )}
      </div>

      <div className="space-y-3 md:hidden">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-3xl bg-muted" />
          ))
        ) : displayedOrders.length > 0 ? (
          displayedOrders.map((order) => {
            const paidAmount =
              order.paidAmount ??
              (order.paymentStatus === "paid" ? order.totalAmount : 0);
            const balance = Math.max(order.totalAmount - paidAmount, 0);
            return (
              <article
                key={order.id}
                className="rounded-3xl border border-card-border bg-card p-4 shadow-sm active:scale-[0.99]"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xl font-black text-foreground">
                      #{order.id}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {new Date(order.createdAt).toLocaleString("zh-TW", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <p className="text-lg font-black text-foreground">
                    ${order.totalAmount.toFixed(0)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge
                    className={cn(
                      "border-0 text-[10px]",
                      ORDER_STATUS_COLORS[order.status] ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  <Badge
                    className={cn(
                      "border-0 text-[10px]",
                      PAY_STATUS_COLORS[order.paymentStatus] ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {PAY_STATUS_LABELS[order.paymentStatus] ??
                      order.paymentStatus}
                  </Badge>
                  <span className="rounded-full bg-muted px-2.5 py-1 text-[10px] font-black text-muted-foreground">
                    {ORDER_TYPE_LABELS[order.type] ?? order.type}
                    {order.tableId ? ` · ${order.tableId} 桌` : ""}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 rounded-2xl bg-muted/50 p-3 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">合計</p>
                    <p className="font-black text-foreground">
                      ${order.totalAmount.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">已收</p>
                    <p className="font-black text-emerald-600">
                      ${paidAmount.toFixed(0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">餘額</p>
                    <p
                      className={cn(
                        "font-black",
                        balance > 0 ? "text-red-600" : "text-muted-foreground",
                      )}
                    >
                      ${balance.toFixed(0)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 border-t border-border pt-3 text-sm font-black">
                  <Link href={`/orders/${order.id}`}>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full rounded-2xl justify-between"
                    >
                      查看明細
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Link href={`/orders/${order.id}/receipt`}>
                    <Button
                      variant="outline"
                      className="min-h-11 w-full rounded-2xl gap-2"
                    >
                      <ReceiptText className="h-4 w-4" />
                      收據
                    </Button>
                  </Link>
                </div>
              </article>
            );
          })
        ) : (
          <div className="rounded-3xl border border-card-border bg-card py-16 text-center shadow-sm">
            <ShoppingBag className="mx-auto mb-3 h-10 w-10 text-muted-foreground opacity-40" />
            <p className="text-sm font-black text-foreground">找不到訂單</p>
            <p className="mt-1 text-xs text-muted-foreground">
              建立新訂單以開始使用
            </p>
          </div>
        )}
      </div>

      <Dialog
        open={showCreate}
        onOpenChange={(open) => {
          if (!open) {
            closeCreateDialog();
          } else {
            setShowCreate(true);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl">
          <DialogHeader>
            <DialogTitle>新增訂單</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">訂單類型</label>
                <Controller
                  control={control}
                  name="type"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        data-testid="select-order-type-new"
                        className="min-h-11 rounded-2xl"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dine-in">內用</SelectItem>
                        <SelectItem value="takeout">外帶</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">桌次</label>
                <Controller
                  control={control}
                  name="tableId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger
                        data-testid="select-order-table"
                        className="min-h-11 rounded-2xl"
                      >
                        <SelectValue placeholder="選擇桌次" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">無桌次</SelectItem>
                        {(tables ?? []).map((t) => (
                          <SelectItem key={t.id} value={String(t.id)}>
                            {t.number} 號桌（{t.section}）
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">新增品項</label>
              <div className="max-h-56 overflow-y-auto rounded-2xl border border-border divide-y divide-border">
                {(products ?? [])
                  .filter((p) => p.available)
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {p.category} — ${p.price.toFixed(2)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-2xl"
                          onClick={() => removeItem(p.id)}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm w-5 text-center font-black">
                          {orderItems.find((i) => i.productId === p.id)
                            ?.quantity ?? 0}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-10 w-10 rounded-2xl"
                          onClick={() => addItem(p.id)}
                          data-testid={`button-add-item-${p.id}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            {orderItems.length > 0 && (
              <div className="rounded-2xl bg-muted/50 p-3 space-y-1.5">
                {orderItems.map((i) => (
                  <div
                    key={i.productId}
                    className="flex justify-between text-sm"
                  >
                    <span>
                      {i.name} x{i.quantity}
                    </span>
                    <span className="font-bold">
                      ${(i.price * i.quantity).toFixed(2)}
                    </span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-black pt-1.5 border-t border-border">
                  <span>合計</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input
                data-testid="input-order-notes"
                placeholder="特殊需求…"
                className="min-h-11 rounded-2xl"
                {...register("notes")}
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                className="min-h-11 rounded-2xl"
                type="button"
                variant="outline"
                onClick={closeCreateDialog}
              >
                取消
              </Button>
              <Button
                className="min-h-11 rounded-2xl font-black"
                data-testid="button-submit-order"
                type="submit"
                disabled={createOrder.isPending || orderItems.length === 0}
              >
                {createOrder.isPending
                  ? "建立中…"
                  : `建立訂單（$${total.toFixed(2)}）`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
