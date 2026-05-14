import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { getCurrentUser } from "@/hooks/use-auth";
import { addOrderPayment, cancelPayment, getOrderPayments, refundPayment, updatePayment, type PaymentMethod } from "@/lib/payments-api";
import { cn } from "@/lib/utils";
import { getSafeErrorMessage } from "@/lib/api-errors";

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

type PaymentSummaryDegraded = {
  paymentSummaryUnavailable?: boolean;
  paymentSummaryErrorMessage?: string;
};

function isPaymentSummaryUnavailable(order: unknown): order is PaymentSummaryDegraded {
  return Boolean((order as PaymentSummaryDegraded | null)?.paymentSummaryUnavailable);
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
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
  const [newPaymentAmount, setNewPaymentAmount] = useState("");
  const [newPaymentMethod, setNewPaymentMethod] = useState<PaymentMethod>("cash");
  const [newPaymentNote, setNewPaymentNote] = useState("");
  const [newPaymentReference, setNewPaymentReference] = useState("");
  const [editingPaymentId, setEditingPaymentId] = useState<number | null>(null);
  const [editPaymentNote, setEditPaymentNote] = useState("");
  const [editPaymentReference, setEditPaymentReference] = useState("");

  const {
    data: order,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useGetOrder(orderId, {
    query: {
      enabled: Number.isFinite(orderId),
      queryKey: getGetOrderQueryKey(orderId),
    },
  });
  const paymentsQuery = useQuery({
    queryKey: ["order-payments", orderId],
    queryFn: () => getOrderPayments(orderId),
    enabled: Number.isFinite(orderId),
  });
  const updateOrder = useUpdateOrder();
  const currentUser = getCurrentUser();
  const canManagePayment = currentUser?.role === "admin" || currentUser?.role === "manager";
  const paymentMutation = useMutation({
    mutationFn: (payload: { amount: number; method: PaymentMethod; note?: string; externalReference?: string }) =>
      addOrderPayment(orderId, payload),
    onSuccess: () => {
      setNewPaymentNote("");
      setNewPaymentReference("");
      refreshQueries();
      paymentsQuery.refetch();
      toast({ title: "付款已入帳，訂單付款狀態已重算" });
    },
    onError: (mutationError) =>
      toast({
        title: "付款失敗",
        description: getSafeErrorMessage(mutationError, "請檢查金額、權限或訂單狀態。"),
        variant: "destructive",
      }),
  });
  const refundMutation = useMutation({
    mutationFn: refundPayment,
    onSuccess: () => { refreshQueries(); paymentsQuery.refetch(); toast({ title: "付款已標記退款，金額已重算" }); },
    onError: (mutationError) => toast({ title: "退款失敗", description: mutationError instanceof Error ? mutationError.message : "請確認權限。", variant: "destructive" }),
  });
  const cancelPaymentMutation = useMutation({
    mutationFn: cancelPayment,
    onSuccess: () => { refreshQueries(); paymentsQuery.refetch(); toast({ title: "付款已取消，金額已重算" }); },
    onError: (mutationError) => toast({ title: "取消付款失敗", description: mutationError instanceof Error ? mutationError.message : "請確認權限。", variant: "destructive" }),
  });
  const editPaymentMutation = useMutation({
    mutationFn: (payload: { id: number; note?: string | null; externalReference?: string | null }) =>
      updatePayment(payload.id, { note: payload.note, externalReference: payload.externalReference }),
    onSuccess: () => { setEditingPaymentId(null); paymentsQuery.refetch(); toast({ title: "付款備註已更新" }); },
    onError: (mutationError) => toast({ title: "更新付款備註失敗", description: mutationError instanceof Error ? mutationError.message : "請確認權限。", variant: "destructive" }),
  });

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
  }, [order]);

  const paymentSummary = paymentsQuery.data;
  const orderSummaryUnavailable = isPaymentSummaryUnavailable(order);
  const paymentSummaryUnavailable = orderSummaryUnavailable || Boolean(paymentsQuery.error);
  const paidAmountFromLedger = paymentSummary?.paidAmount ?? order?.paidAmount ?? 0;
  const effectivePaymentStatus = paymentSummaryUnavailable ? (order?.paymentStatus ?? "unpaid") : (paymentSummary?.paymentStatus ?? order?.paymentStatus ?? "unpaid");
  const balance = paymentSummary?.balance ?? order?.balance ?? 0;

  useEffect(() => {
    const trustedBalance = paymentsQuery.data?.balance ?? order?.balance;
    if (trustedBalance !== undefined) {
      setNewPaymentAmount(String(trustedBalance || ""));
    }
  }, [order?.balance, paymentsQuery.data?.balance]);

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
    update({ paymentNote: paymentNote || null }, "付款備註已更新");
  };

  const submitPayment = (method = newPaymentMethod, amountOverride?: number) => {
    const amount = amountOverride ?? Number(newPaymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast({ title: "付款金額必須大於 0", variant: "destructive" });
      return;
    }
    paymentMutation.mutate({
      amount,
      method,
      note: newPaymentNote || undefined,
      externalReference: newPaymentReference || undefined,
    });
  };

  const cancelOrder = () => {
    const hasPayments = (paymentSummary?.paymentCount ?? order?.paymentCount ?? 0) > 0;
    const message = hasPayments
      ? "此訂單已有付款紀錄，取消訂單不會刪除付款。確定取消？"
      : "確定取消此訂單？";
    if (!window.confirm(message)) return;
    update({ status: "cancelled", paidAt: null }, "訂單已取消，不會列入 Dashboard / 日結營收");
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="h-11 w-32 animate-pulse rounded-2xl bg-muted" />
        {orderSummaryUnavailable && (
        <div className="flex flex-col gap-2 rounded-3xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>付款摘要暫時無法讀取，已先顯示訂單保存的金額狀態。</span>
          <Button variant="outline" className="min-h-10 rounded-2xl" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "重試中…" : "重試"}
          </Button>
        </div>
      )}

      {paymentsQuery.error && (
        <div className="flex flex-col gap-2 rounded-3xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800 sm:flex-row sm:items-center sm:justify-between">
          <span>{getSafeErrorMessage(paymentsQuery.error, "付款紀錄暫時無法讀取，頁面仍可查看訂單明細。")}</span>
          <Button variant="outline" className="min-h-10 rounded-2xl" onClick={() => paymentsQuery.refetch()} disabled={paymentsQuery.isFetching}>
            {paymentsQuery.isFetching ? "重試中…" : "重試付款摘要"}
          </Button>
        </div>
      )}

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
          {error ? getSafeErrorMessage(error, "API 暫時無法讀取此訂單。") : "找不到此訂單。"}
        </p>
        <div className="flex flex-col justify-center gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? "重試中…" : "重試"}
          </Button>
          <Button variant="link" onClick={() => setLocation("/orders")}>
            返回訂單列表
          </Button>
        </div>
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
          value={formatMoney(paidAmountFromLedger)}
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
              <h2 className="font-black text-foreground">付款紀錄結帳台</h2>
              <p className="text-xs text-muted-foreground">新增每一筆付款，後端會依有效付款紀錄重算已收、餘額與付款狀態。</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 rounded-3xl border border-border bg-muted/30 p-3 sm:grid-cols-4">
            <div><p className="text-[11px] font-black text-muted-foreground">合計</p><p className="text-lg font-black">{formatMoney(order.totalAmount)}</p></div>
            <div><p className="text-[11px] font-black text-muted-foreground">有效已收</p><p className="text-lg font-black text-emerald-600">{formatMoney(paidAmountFromLedger)}</p></div>
            <div><p className="text-[11px] font-black text-muted-foreground">餘額</p><p className={cn("text-lg font-black", balance > 0 ? "text-red-600" : "text-emerald-600")}>{formatMoney(balance)}</p></div>
            <div><p className="text-[11px] font-black text-muted-foreground">狀態</p><p className="text-sm font-black">{PAY_STATUS_LABELS[effectivePaymentStatus] ?? effectivePaymentStatus}</p></div>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">訂單狀態</label>
              <Select value={order.status} onValueChange={(value) => update({ status: value })} disabled={updateOrder.isPending}>
                <SelectTrigger data-testid="select-update-status" className="min-h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">新增付款金額</label>
              <Input data-testid="input-payment-amount" className="min-h-12 rounded-2xl text-lg font-black" type="number" min="1" step="1" value={newPaymentAmount} onChange={(event) => setNewPaymentAmount(event.target.value)} disabled={order.status === "cancelled"} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">付款方式</label>
              <Select value={newPaymentMethod} onValueChange={(value) => setNewPaymentMethod(value as PaymentMethod)} disabled={order.status === "cancelled"}>
                <SelectTrigger className="min-h-12 rounded-2xl"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(PAY_METHOD_LABELS).filter(([value]) => value !== "unpaid").map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">外部單號 / 末五碼</label>
              <Input className="min-h-12 rounded-2xl" value={newPaymentReference} onChange={(event) => setNewPaymentReference(event.target.value)} placeholder="可留空" />
            </div>
          </div>

          <div className="mt-3 space-y-1.5">
            <label className="text-xs font-black uppercase tracking-wider text-muted-foreground">付款備註</label>
            <Input data-testid="input-payment-note" className="min-h-12 rounded-2xl" value={newPaymentNote} onChange={(event) => setNewPaymentNote(event.target.value)} placeholder="例：客人先付訂金 / 分開付款" />
          </div>

          <Button data-testid="button-add-payment" className="mt-3 min-h-14 w-full rounded-2xl text-base font-black" onClick={() => submitPayment()} disabled={paymentMutation.isPending || order.status === "cancelled"}>
            {paymentMutation.isPending ? "入帳中…" : "新增付款紀錄"}
          </Button>

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {(["cash", "card", "transfer", "external"] as PaymentMethod[]).map((method) => (
              <Button key={method} data-testid={`button-pay-${method}`} variant="outline" className="min-h-14 rounded-2xl gap-1.5 font-black" onClick={() => submitPayment(method, balance)} disabled={paymentMutation.isPending || order.status === "cancelled" || balance <= 0}>
                <CreditCard className="h-4 w-4" /> {PAY_METHOD_LABELS[method]}收餘額
              </Button>
            ))}
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-foreground">付款紀錄</h3>
              <Badge variant="outline" className="rounded-full">{paymentSummary?.paymentCount ?? 0} 筆</Badge>
            </div>
            {paymentsQuery.isLoading ? (
              <div className="h-24 animate-pulse rounded-3xl bg-muted" />
            ) : (paymentSummary?.payments?.length ?? 0) === 0 ? (
              <div className="rounded-3xl border border-dashed border-border p-5 text-center text-sm font-bold text-muted-foreground">尚無付款紀錄，請新增付款後再結帳。</div>
            ) : (
              <div className="space-y-2">
                {paymentSummary?.payments.map((payment) => (
                  <div key={payment.id} className="rounded-3xl border border-border bg-background/60 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="text-lg font-black text-foreground">{formatMoney(payment.amount)} <span className="text-xs text-muted-foreground">{PAY_METHOD_LABELS[payment.method]}</span></p>
                        <p className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString("zh-TW")} · {payment.createdByName ?? (payment.createdBy ? `User #${payment.createdBy}` : "未記錄操作人")}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{payment.note || "無備註"}{payment.externalReference ? ` · ${payment.externalReference}` : ""}</p>
                      </div>
                      <Badge className={cn("w-fit border-0", payment.status === "paid" ? "bg-emerald-100 text-emerald-700" : payment.status === "refunded" ? "bg-purple-100 text-purple-700" : "bg-muted text-muted-foreground")}>{payment.status === "paid" ? "有效" : payment.status === "refunded" ? "已退款" : "已取消"}</Badge>
                    </div>
                    {editingPaymentId === payment.id ? (
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <Input className="min-h-11 rounded-2xl" value={editPaymentNote} onChange={(event) => setEditPaymentNote(event.target.value)} placeholder="備註" />
                        <Input className="min-h-11 rounded-2xl" value={editPaymentReference} onChange={(event) => setEditPaymentReference(event.target.value)} placeholder="外部單號" />
                        <Button className="rounded-2xl" onClick={() => editPaymentMutation.mutate({ id: payment.id, note: editPaymentNote || null, externalReference: editPaymentReference || null })}>儲存</Button>
                        <Button variant="outline" className="rounded-2xl" onClick={() => setEditingPaymentId(null)}>取消</Button>
                      </div>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {canManagePayment && <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setEditingPaymentId(payment.id); setEditPaymentNote(payment.note ?? ""); setEditPaymentReference(payment.externalReference ?? ""); }}>編輯備註</Button>}
                        {canManagePayment && payment.status === "paid" && <Button size="sm" variant="outline" className="rounded-xl text-purple-700" onClick={() => window.confirm("確定退款此付款？") && refundMutation.mutate(payment.id)}>退款</Button>}
                        {canManagePayment && payment.status === "paid" && <Button size="sm" variant="outline" className="rounded-xl text-red-700" onClick={() => window.confirm("確定取消此付款紀錄？") && cancelPaymentMutation.mutate(payment.id)}>取消付款</Button>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <Button data-testid="button-cancel-order" variant="outline" className="mt-4 min-h-12 w-full rounded-2xl gap-2 border-red-500/30 font-black text-destructive hover:text-destructive" onClick={cancelOrder} disabled={updateOrder.isPending || order.status === "cancelled"}>
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
                      {formatMoney(item.unitPrice)} / 份 · 後端儲存後重算小計
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
          <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-3 text-xs font-bold text-muted-foreground">
            儲存後，後端會重新讀取商品快照、重算訂單合計與付款餘額；此頁不自行決定最終金額。
          </div>
        </div>
      </section>
    </div>
  );
}
