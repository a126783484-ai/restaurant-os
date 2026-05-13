import { useEffect, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useGetOrder, useUpdateOrder, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard, Minus, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
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
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  preparing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const PAY_STATUS_COLORS: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  cancelled: "bg-muted text-muted-foreground",
};

type EditableItem = { productId: number; productName: string; quantity: number; notes?: string | null };

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

  const { data: order, isLoading, error } = useGetOrder(orderId, {
    query: { enabled: Number.isFinite(orderId), queryKey: getGetOrderQueryKey(orderId) },
  });
  const updateOrder = useUpdateOrder();

  useEffect(() => {
    if (!order) return;
    setEditableItems(order.items.map(item => ({ productId: item.productId, productName: item.productName, quantity: item.quantity, notes: item.notes })));
    setOrderNotes(order.notes ?? "");
    setPaymentNote(order.paymentNote ?? "");
    setPaidAmount(String(order.paidAmount ?? (order.paymentStatus === "paid" ? order.totalAmount : 0)));
  }, [order]);

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
        onError: () => toast({ title: "更新失敗", description: "請稍後再試或重新整理頁面。", variant: "destructive" }),
      }
    );
  };

  const changeQuantity = (productId: number, delta: number) => {
    setEditableItems(prev => prev.flatMap(item => {
      if (item.productId !== productId) return [item];
      const quantity = item.quantity + delta;
      return quantity > 0 ? [{ ...item, quantity }] : [];
    }));
  };

  const saveItems = () => {
    if (editableItems.length === 0) {
      toast({ title: "訂單至少需要一個品項", variant: "destructive" });
      return;
    }
    update({ items: editableItems.map(item => ({ productId: item.productId, quantity: item.quantity, notes: item.notes ?? undefined })), notes: orderNotes || null }, "訂單明細已更新");
  };

  const savePayment = () => {
    update({ paidAmount: Number(paidAmount) || 0, paymentNote: paymentNote || null }, "付款資訊已更新");
  };

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-24" />
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (error || !order) return (
    <div className="p-6 text-center space-y-3">
      <p className="text-muted-foreground">找不到此訂單，或 API 暫時無法讀取。</p>
      <Button variant="link" onClick={() => setLocation("/orders")}>返回訂單列表</Button>
    </div>
  );

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5 overflow-x-hidden">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/orders")} className="gap-1.5 -ml-2 min-h-11">
        <ArrowLeft className="h-4 w-4" /> 訂單列表
      </Button>

      <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground">訂單 #{order.id}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {ORDER_TYPE_LABELS[order.type] ?? order.type} &mdash; {new Date(order.createdAt).toLocaleString("zh-TW")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge className={cn("text-xs border-0", ORDER_STATUS_COLORS[order.status])}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
            <Badge className={cn("text-xs border-0", PAY_STATUS_COLORS[order.paymentStatus])}>{PAY_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">訂單狀態</label>
            <Select value={order.status} onValueChange={val => update({ status: val })} disabled={updateOrder.isPending}>
              <SelectTrigger data-testid="select-update-status" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_STATUS_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">付款狀態</label>
            <Select value={order.paymentStatus} onValueChange={val => update({ paymentStatus: val, paidAmount: val === "paid" ? order.totalAmount : Number(paidAmount) || 0 })} disabled={updateOrder.isPending}>
              <SelectTrigger data-testid="select-payment-status" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAY_STATUS_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">付款方式</label>
            <Select value={order.paymentMethod ?? "unpaid"} onValueChange={val => update({ paymentMethod: val })} disabled={updateOrder.isPending}>
              <SelectTrigger data-testid="select-payment-method" className="min-h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PAY_METHOD_LABELS).map(([val, label]) => <SelectItem key={val} value={val}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">已收金額</label>
            <Input data-testid="input-paid-amount" className="min-h-11" type="number" min="0" step="1" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} onBlur={savePayment} />
          </div>
        </div>

        <div className="space-y-1.5 mt-3">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">付款備註</label>
          <Input data-testid="input-payment-note" className="min-h-11" value={paymentNote} onChange={e => setPaymentNote(e.target.value)} onBlur={savePayment} placeholder="例：轉帳後五碼 / 外部支付單號" />
        </div>

        <div className="flex flex-wrap gap-2 mt-3">
          {[
            { method: "cash", label: "現金" },
            { method: "card", label: "刷卡" },
            { method: "transfer", label: "轉帳" },
            { method: "external", label: "外部支付" },
          ].map(({ method, label }) => (
            <Button key={method} data-testid={`button-pay-${method}`} variant="outline" size="sm" className="gap-1.5 min-h-10" onClick={() => update({ paymentStatus: "paid", paymentMethod: method, paidAmount: order.totalAmount })} disabled={updateOrder.isPending}>
              <CreditCard className="h-3.5 w-3.5" /> {label}已收
            </Button>
          ))}
          <Button data-testid="button-cancel-order" variant="outline" size="sm" className="gap-1.5 min-h-10 text-destructive" onClick={() => update({ status: "cancelled", paymentStatus: "cancelled" }, "訂單已取消")} disabled={updateOrder.isPending || order.status === "cancelled"}>
            <XCircle className="h-3.5 w-3.5" /> 取消訂單
          </Button>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-semibold text-foreground">點餐明細</h2>
          <Button data-testid="button-save-order-items" size="sm" className="min-h-10" onClick={saveItems} disabled={updateOrder.isPending}>{updateOrder.isPending ? "儲存中…" : "儲存明細"}</Button>
        </div>
        <div className="divide-y divide-border">
          {editableItems.map(item => (
            <div key={item.productId} data-testid={`order-item-${item.productId}`} className="py-3 first:pt-0 last:pb-0 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground min-w-0 truncate">{item.productName}</p>
                <div className="flex items-center gap-2 shrink-0">
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(item.productId, -1)}><Minus className="h-3.5 w-3.5" /></Button>
                  <span className="w-8 text-center text-sm font-bold">{item.quantity}</span>
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => changeQuantity(item.productId, 1)}><Plus className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <Input className="min-h-10" value={item.notes ?? ""} onChange={e => setEditableItems(prev => prev.map(current => current.productId === item.productId ? { ...current, notes: e.target.value } : current))} placeholder="品項備註" />
            </div>
          ))}
        </div>
        <div className="space-y-1.5 pt-3 mt-2 border-t border-border">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">訂單備註</label>
          <Input data-testid="input-edit-order-notes" className="min-h-11" value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="特殊需求…" />
        </div>
        <div className="flex justify-between items-center pt-3 mt-2 border-t border-border">
          <span className="text-sm font-bold text-foreground">合計</span>
          <span className="text-xl font-bold text-foreground">${order.totalAmount.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
