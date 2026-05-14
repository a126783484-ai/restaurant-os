import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetOrder,
  useUpdateOrder,
  getGetOrderQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowLeft,
  CreditCard,
  Minus,
  Plus,
  Printer,
  ReceiptText,
  Wallet,
  XCircle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
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

const PAY_METHOD_LABELS: Record<string, string> = {
  unpaid: "未付款",
  cash: "現金",
  card: "刷卡",
  transfer: "轉帳",
  external: "外部支付",
};

const ORDER_STATUS_COLORS: Record<string, string> = {
  pending:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  preparing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed:
    "bg-slate-100 text-slate-700 dark:bg-slate-900/40 dark:text-slate-300",
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

type EditableItem = {
  productId: number;
  productName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  notes?: string | null;
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function derivePaymentStatus(paidAmount: number, totalAmount: number) {
  if (paidAmount <= 0) return "unpaid";
  if (paidAmount < totalAmount) return "partially_paid";
  return "paid";
}

function AmountTile({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div
      className={cn(
        "rounded-3xl border p-4 shadow-sm",
        tone === "success"
          ? "border-emerald-500/25 bg-emerald-500/8"
          : tone === "danger"
            ? "border-red-500/25 bg-red-500/8"
            : "border-card-border bg-card",
      )}
    >
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 text-2xl font-black tracking-tight",
          tone === "success"
            ? "text-emerald-600"
            : tone === "danger"
              ? "text-red-600"
              : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );
}

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editableItems, setEditableItems] = useState<EditableItem[]>([]);
  const [orderNotes, setOrderNotes] = useState("");
  const [paymentNote, setPaymentNote] = useState("");
  const [paidAmount, setPaidAmount] = useState("0");

  const {
    data: order,
    isLoading,
    error,
  } = useGetOrder(orderId, {
    query: {
      enabled: Number.isFinite(orderId),
      queryKey: getGetOrderQueryKey(orderId),
    },
  });
  const updateOrder = useUpdateOrder();

  useEffect(() => {
    if (!order) return;
    setEditableItems(
      order.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        subtotal: item.subtotal,
        notes: item.notes,
      })),
    );
    setOrderNotes(order.notes ?? "");
    setPaymentNote(order.paymentNote ?? "");
    setPaidAmount(
      String(
        order.paidAmount ??
          (order.paymentStatus === "paid" ? order.totalAmount : 0),
      ),
    );
  }, [order]);

  const currentPaidAmount = Number(paidAmount) || 0;
  const balance = order
    ? Math.max(order.totalAmount - (order.paidAmount ?? 0), 0)
    : 0;
  const draftPaymentStatus = order
    ? derivePaymentStatus(currentPaidAmount, order.totalAmount)
    : "unpaid";
  const draftBalance = order
    ? Math.max(order.totalAmount - Math.max(currentPaidAmount, 0), 0)
    : 0;
  const editedTotal = useMemo(
    () =>
      editableItems.reduce(
        (sum, item) => sum + item.unitPrice * item.quantity,
        0,
      ),
    [editableItems],
  );

  const refreshQueries = () => {
    queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
  };

  const update = (data: Record<string, unknown>, success = "訂單已更新") => {
    updateOrder.mutate(
      { id: orderId, data },
      {
        onSuccess: () => {
          refreshQueries();
          toast({ title: success });
        },
        onError: (updateError) =>
          toast({
            title: "更新失敗",
            description:
              updateError instanceof Error
                ? updateError.message
                : "請稍後再試或重新整理頁面。",
            variant: "destructive",
          }),
      },
    );
  };

  const changeQuantity = (productId: number, delta: number) => {
    setEditableItems((prev) =>
      prev.flatMap((item) => {
        if (item.productId !== productId) return [item];
        const quantity = Math.max(0, item.quantity + delta);
        return quantity > 0
          ? [
              {
                ...item,
                quantity,
                subtotal: Math.round(item.unitPrice * quantity * 100) / 100,
              },
            ]
          : [];
      }),
    );
  };

  const saveItems = () => {
    if (editableItems.length === 0) {
      toast({
        title: "訂單至少需要一個品項",
        description: "若要作廢請使用取消訂單，避免資料被清空。",
        variant: "destructive",
      });
      return;
    }
    update(
      {
        items: editableItems.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          notes: item.notes ?? undefined,
        })),
        notes: orderNotes || null,
      },
      "訂單明細已更新，合計已由後端重算",
    );
  };

  const savePayment = () => {
    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      toast({ title: "已收金額必須是 0 以上的數字", variant: "destructive" });
      return;
    }
    update(
      {
        paidAmount: amount,
        paymentStatus: derivePaymentStatus(amount, order?.totalAmount ?? 0),
        paymentNote: paymentNote || null,
      },
      "付款資訊已更新",
    );
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="h-11 w-32 animate-pulse rounded-2xl bg-muted" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-3xl bg-muted"
            />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-[2rem] bg-muted" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="p-6 text-center space-y-3">
        <p className="text-muted-foreground">
          找不到此訂單，或 API 暫時無法讀取。
        </p>
        <Button variant="link" onClick={() => setLocation("/orders")}>
          返回訂單列表
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 overflow-x-hidden p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setLocation("/orders")}
          className="min-h-11 w-fit gap-1.5 rounded-2xl"
        >
          <ArrowLeft className="h-4 w-4" /> 訂單列表
        </Button>
        <Link href={`/orders/${order.id}/receipt`}>
          <Button
            data-testid="button-print-receipt"
            className="min-h-12 w-full gap-2 rounded-2xl font-black sm:w-auto"
          >
            <Printer className="h-4 w-4" /> 列印收據
          </Button>
        </Link>
      </div>

      <section className="relative overflow-hidden rounded-[2rem] border border-card-border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <ReceiptText className="h-3.5 w-3.5" /> Checkout Workbench
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-4xl">
              訂單 #{order.id}
            </h1>
            <div className="mt-3 grid grid-cols-1 gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              <p>
                開單時間：
                <span className="font-bold text-foreground">
                  {new Date(order.createdAt).toLocaleString("zh-TW")}
                </span>
              </p>
              <p>
                用餐型態：
                <span className="font-bold text-foreground">
                  {ORDER_TYPE_LABELS[order.type] ?? order.type}
                  {order.tableId ? ` · ${order.tableId} 桌` : ""}
                </span>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Badge
              className={cn(
                "border-0 px-3 py-1 text-xs",
                ORDER_STATUS_COLORS[order.status],
              )}
            >
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            <Badge
              className={cn(
                "border-0 px-3 py-1 text-xs",
                PAY_STATUS_COLORS[order.paymentStatus],
              )}
            >
              {PAY_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
            </Badge>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <AmountTile
          label="合計 totalAmount"
          value={formatMoney(order.totalAmount)}
        />
        <AmountTile
          label="已收 paidAmount"
          value={formatMoney(order.paidAmount ?? 0)}
          tone="success"
        />
        <AmountTile
          label="餘額 balance"
          value={formatMoney(balance)}
          tone={balance > 0 ? "danger" : "success"}
        />
      </div>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-card-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-black text-foreground">手動收款</h2>
              <p className="text-xs text-muted-foreground">
                輸入已收金額後，系統自動判斷未付款 / 部分付款 / 已付款。
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                訂單狀態
              </label>
              <Select
                value={order.status}
                onValueChange={(value) =>
                  update({
                    status: value,
                    paymentStatus:
                      value === "cancelled" ? "cancelled" : undefined,
                  })
                }
                disabled={updateOrder.isPending}
              >
                <SelectTrigger
                  data-testid="select-update-status"
                  className="min-h-12 rounded-2xl"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                付款狀態
              </label>
              <Select
                value={order.paymentStatus}
                onValueChange={(value) =>
                  update({
                    paymentStatus: value,
                    paidAmount:
                      value === "paid"
                        ? order.totalAmount
                        : value === "unpaid"
                          ? 0
                          : Number(paidAmount) || 0,
                  })
                }
                disabled={updateOrder.isPending}
              >
                <SelectTrigger
                  data-testid="select-payment-status"
                  className="min-h-12 rounded-2xl"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAY_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                付款方式
              </label>
              <Select
                value={order.paymentMethod ?? "unpaid"}
                onValueChange={(value) => update({ paymentMethod: value })}
                disabled={updateOrder.isPending}
              >
                <SelectTrigger
                  data-testid="select-payment-method"
                  className="min-h-12 rounded-2xl"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAY_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
                已收金額
              </label>
              <Input
                data-testid="input-paid-amount"
                className="min-h-12 rounded-2xl text-lg font-black"
                type="number"
                min="0"
                step="1"
                value={paidAmount}
                onChange={(event) => setPaidAmount(event.target.value)}
                onBlur={savePayment}
              />
            </div>
          </div>

          <div className="mt-3 rounded-3xl border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">輸入後付款狀態</span>
              <span className="font-black text-foreground">
                {PAY_STATUS_LABELS[draftPaymentStatus]}
              </span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="text-muted-foreground">輸入後餘額</span>
              <span
                className={cn(
                  "font-black",
                  draftBalance > 0 ? "text-red-600" : "text-emerald-600",
                )}
              >
                {formatMoney(draftBalance)}
              </span>
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              付款備註
            </label>
            <Input
              data-testid="input-payment-note"
              className="min-h-12 rounded-2xl"
              value={paymentNote}
              onChange={(event) => setPaymentNote(event.target.value)}
              onBlur={savePayment}
              placeholder="例：轉帳後五碼 / 外部支付單號 / 刷卡授權碼"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { method: "cash", label: "現金已收" },
              { method: "card", label: "刷卡已收" },
              { method: "transfer", label: "轉帳已收" },
              { method: "external", label: "外部支付已收" },
            ].map(({ method, label }) => (
              <Button
                key={method}
                data-testid={`button-pay-${method}`}
                variant="outline"
                className="min-h-14 rounded-2xl gap-1.5 font-black"
                onClick={() =>
                  update({
                    paymentStatus: "paid",
                    paymentMethod: method,
                    paidAmount: order.totalAmount,
                  })
                }
                disabled={updateOrder.isPending}
              >
                <CreditCard className="h-4 w-4" /> {label}
              </Button>
            ))}
          </div>

          <Button
            data-testid="button-cancel-order"
            variant="outline"
            className="mt-4 min-h-12 w-full rounded-2xl gap-2 border-red-500/30 font-black text-destructive hover:text-destructive"
            onClick={() =>
              update(
                {
                  status: "cancelled",
                  paymentStatus: "cancelled",
                  paidAt: null,
                },
                "訂單已取消，不會列入 Dashboard 營收",
              )
            }
            disabled={updateOrder.isPending || order.status === "cancelled"}
          >
            <XCircle className="h-4 w-4" /> 取消訂單
          </Button>
        </div>

        <div className="rounded-[2rem] border border-card-border bg-card p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-black text-foreground">修改品項</h2>
              <p className="text-xs text-muted-foreground">
                數量降到 0 會移除品項；儲存後後端重算合計。
              </p>
            </div>
            <Button
              data-testid="button-save-order-items"
              className="min-h-12 rounded-2xl font-black"
              onClick={saveItems}
              disabled={updateOrder.isPending}
            >
              {updateOrder.isPending ? "儲存中…" : "儲存品項"}
            </Button>
          </div>

          <div className="divide-y divide-border rounded-3xl border border-border">
            {editableItems.map((item) => (
              <div
                key={item.productId}
                data-testid={`order-item-${item.productId}`}
                className="space-y-3 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-foreground">
                      {item.productName}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {formatMoney(item.unitPrice)} / 份 · 小計{" "}
                      {formatMoney(item.unitPrice * item.quantity)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 rounded-2xl"
                      onClick={() => changeQuantity(item.productId, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </Button>
                    <span className="w-8 text-center text-base font-black">
                      {item.quantity}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-11 w-11 rounded-2xl"
                      onClick={() => changeQuantity(item.productId, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <Input
                  className="min-h-11 rounded-2xl"
                  value={item.notes ?? ""}
                  onChange={(event) =>
                    setEditableItems((prev) =>
                      prev.map((current) =>
                        current.productId === item.productId
                          ? { ...current, notes: event.target.value }
                          : current,
                      ),
                    )
                  }
                  placeholder="品項備註"
                />
              </div>
            ))}
            {editableItems.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                品項已全部移除；請至少保留一項或取消訂單。
              </div>
            )}
          </div>

          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              訂單備註
            </label>
            <Input
              data-testid="input-edit-order-notes"
              className="min-h-12 rounded-2xl"
              value={orderNotes}
              onChange={(event) => setOrderNotes(event.target.value)}
              placeholder="特殊需求…"
            />
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-black text-foreground">
              畫面試算合計
            </span>
            <span className="text-2xl font-black text-foreground">
              {formatMoney(editedTotal)}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
