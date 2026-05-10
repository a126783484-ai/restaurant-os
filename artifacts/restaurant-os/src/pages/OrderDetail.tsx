import { useParams, useLocation } from "wouter";
import { useGetOrder, useUpdateOrder, getGetOrderQueryKey, getListOrdersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  paid: "已付款",
  refunded: "已退款",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

const PAY_METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  card: "刷卡",
  digital: "電子支付",
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
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

export default function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: order, isLoading } = useGetOrder(orderId, {
    query: { enabled: !!orderId, queryKey: getGetOrderQueryKey(orderId) },
  });
  const updateOrder = useUpdateOrder();

  const update = (field: string, value: string) => {
    updateOrder.mutate(
      { id: orderId, data: { [field]: value } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetOrderQueryKey(orderId) });
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          toast({ title: "訂單已更新" });
        },
        onError: () => toast({ title: "更新失敗", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-24" />
        <div className="h-48 bg-muted animate-pulse rounded-xl" />
        <div className="h-32 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!order) return (
    <div className="p-6 text-center">
      <p className="text-muted-foreground">找不到此訂單。</p>
      <Button variant="link" onClick={() => setLocation("/orders")}>返回訂單列表</Button>
    </div>
  );

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-5">
      <Button variant="ghost" size="sm" onClick={() => setLocation("/orders")} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" /> 訂單列表
      </Button>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">訂單 #{order.id}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {ORDER_TYPE_LABELS[order.type] ?? order.type} &mdash; {new Date(order.createdAt).toLocaleString("zh-TW")}
            </p>
          </div>
          <div className="flex gap-2">
            <Badge className={cn("text-xs border-0", ORDER_STATUS_COLORS[order.status])}>
              {ORDER_STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            <Badge className={cn("text-xs border-0", PAY_STATUS_COLORS[order.paymentStatus])}>
              {PAY_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">訂單狀態</label>
            <Select value={order.status} onValueChange={val => update("status", val)}>
              <SelectTrigger data-testid="select-update-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(ORDER_STATUS_LABELS).map(([val, label]) => (
                  <SelectItem key={val} value={val}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">付款狀態</label>
            <Select value={order.paymentStatus} onValueChange={val => update("paymentStatus", val)}>
              <SelectTrigger data-testid="select-payment-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">未付款</SelectItem>
                <SelectItem value="paid">已付款</SelectItem>
                <SelectItem value="refunded">已退款</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {order.paymentStatus === "unpaid" && (
          <div className="flex gap-2 mt-3">
            {[
              { method: "cash", label: "現金" },
              { method: "card", label: "刷卡" },
              { method: "digital", label: "電子支付" },
            ].map(({ method, label }) => (
              <Button
                key={method}
                data-testid={`button-pay-${method}`}
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => { update("paymentStatus", "paid"); update("paymentMethod", method); }}
              >
                <CreditCard className="h-3.5 w-3.5" /> {label}
              </Button>
            ))}
          </div>
        )}

        {order.paymentMethod && (
          <p className="text-xs text-muted-foreground mt-2">
            付款方式：{PAY_METHOD_LABELS[order.paymentMethod] ?? order.paymentMethod}
          </p>
        )}
        {order.notes && <p className="text-xs text-muted-foreground mt-2 italic">備註：{order.notes}</p>}
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4">點餐明細</h2>
        <div className="divide-y divide-border">
          {order.items.map(item => (
            <div key={item.id} data-testid={`order-item-${item.id}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-foreground">{item.productName}</p>
                <p className="text-xs text-muted-foreground">單價 ${item.unitPrice.toFixed(2)}</p>
                {item.notes && <p className="text-xs text-muted-foreground italic">{item.notes}</p>}
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-muted-foreground">x{item.quantity}</p>
                <p className="text-sm font-semibold text-foreground">${item.subtotal.toFixed(2)}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center pt-3 mt-2 border-t border-border">
          <span className="text-sm font-bold text-foreground">合計</span>
          <span className="text-xl font-bold text-foreground">${order.totalAmount.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
