import { useRef, useState } from "react";
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
import { Plus, ShoppingBag, ChevronRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

interface OrderFormValues {
  type: string;
  tableId: string;
  notes: string;
}

export default function Orders() {
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);
  const [orderItems, setOrderItems] = useState<{ productId: number; name: string; price: number; quantity: number }[]>([]);
  const idempotencyRef = useRef<string>(crypto.randomUUID());

  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: orders, isLoading, error } = useListOrders({
    status: statusFilter !== "all" ? statusFilter : undefined,
    type: typeFilter !== "all" ? typeFilter : undefined,
  });
  const { data: products } = useListProducts();
  const { data: tables } = useListTables();
  const createOrder = useCreateOrder();

  const { register, handleSubmit, control, reset } = useForm<OrderFormValues>({ defaultValues: { type: "dine-in", tableId: "__none__", notes: "" } });

  const addItem = (productId: number) => {
    const product = products?.find(p => p.id === productId);
    if (!product) return;
    setOrderItems(prev => {
      const existing = prev.find(i => i.productId === productId);
      if (existing) return prev.map(i => i.productId === productId ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { productId, name: product.name, price: product.price, quantity: 1 }];
    });
  };

  const removeItem = (productId: number) => {
    setOrderItems(prev => prev.flatMap(i => i.productId === productId ? i.quantity > 1 ? [{ ...i, quantity: i.quantity - 1 }] : [] : [i]));
  };

  const total = orderItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const onSubmit = (data: OrderFormValues) => {
    if (orderItems.length === 0) { toast({ title: "請至少新增一項商品", variant: "destructive" }); return; }
    createOrder.mutate(
      {
        data: {
          type: data.type,
          tableId: (data.tableId && data.tableId !== "__none__") ? Number(data.tableId) : undefined,
          notes: data.notes || undefined,
          idempotencyKey: idempotencyRef.current,
          items: orderItems.map(i => ({ productId: i.productId, quantity: i.quantity })),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
          setShowCreate(false);
          setOrderItems([]);
          reset();
          idempotencyRef.current = crypto.randomUUID();
          toast({ title: "訂單已建立" });
        },
        onError: () => toast({ title: "建立訂單失敗", description: "請檢查品項或稍後再試。", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">訂單管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isLoading ? "載入中…" : `共 ${orders?.length ?? 0} 筆訂單`}</p>
        </div>
        <Button data-testid="button-new-order" onClick={() => setShowCreate(true)} size="sm" className="gap-1.5 min-h-11">
          <Plus className="h-4 w-4" /> 新增訂單
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="select-order-status" className="w-36">
            <SelectValue placeholder="所有狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有狀態</SelectItem>
            {Object.entries(ORDER_STATUS_LABELS).map(([val, label]) => (
              <SelectItem key={val} value={val}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger data-testid="select-order-type" className="w-36">
            <SelectValue placeholder="所有類型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有類型</SelectItem>
            <SelectItem value="dine-in">內用</SelectItem>
            <SelectItem value="takeout">外帶</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          訂單 API 暫時無法讀取，請重新整理或稍後再試。
        </div>
      )}

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span className="w-12">訂單</span>
          <span className="flex-1">類型</span>
          <span className="hidden sm:block w-24">狀態</span>
          <span className="hidden sm:block w-24">付款</span>
          <span className="w-20 text-right">金額</span>
          <span className="w-4" />
        </div>
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted/20 m-1 rounded" />)}
          </div>
        ) : orders && orders.length > 0 ? (
          orders.map(order => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div data-testid={`row-order-${order.id}`} className="flex items-center gap-3 px-4 sm:px-5 py-3.5 hover:bg-muted/50 transition-colors cursor-pointer border-b border-border last:border-b-0">
                <span className="w-12 text-sm font-mono font-semibold text-muted-foreground">#{order.id}</span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{ORDER_TYPE_LABELS[order.type] ?? order.type}</p>
                  <p className="text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <Badge className={cn("hidden sm:block text-[10px] border-0 w-24 text-center", ORDER_STATUS_COLORS[order.status] ?? "bg-muted text-muted-foreground")}>
                  {ORDER_STATUS_LABELS[order.status] ?? order.status}
                </Badge>
                <Badge className={cn("hidden sm:block text-[10px] border-0 w-24 text-center", PAY_STATUS_COLORS[order.paymentStatus] ?? "bg-muted text-muted-foreground")}>
                  {PAY_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                </Badge>
                <span className="w-20 text-right text-sm font-semibold text-foreground">${order.totalAmount.toFixed(2)}</span>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </div>
            </Link>
          ))
        ) : (
          <div className="py-16 text-center">
            <ShoppingBag className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">找不到訂單</p>
            <p className="text-xs text-muted-foreground mt-1">建立新訂單以開始使用</p>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={open => { if (!open) { setOrderItems([]); reset(); } setShowCreate(open); }}>
        <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>新增訂單</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">訂單類型</label>
                <Controller control={control} name="type" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-order-type-new"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="dine-in">內用</SelectItem>
                      <SelectItem value="takeout">外帶</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">桌次</label>
                <Controller control={control} name="tableId" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-order-table"><SelectValue placeholder="選擇桌次" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">無桌次</SelectItem>
                      {(tables ?? []).map(t => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.number} 號桌（{t.section}）</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">新增品項</label>
              <div className="border border-border rounded-lg divide-y divide-border max-h-48 overflow-y-auto">
                {(products ?? []).filter(p => p.available).map(p => (
                  <div key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.category} — ${p.price.toFixed(2)}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => removeItem(p.id)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm w-5 text-center font-medium">
                        {orderItems.find(i => i.productId === p.id)?.quantity ?? 0}
                      </span>
                      <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => addItem(p.id)} data-testid={`button-add-item-${p.id}`}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {orderItems.length > 0 && (
              <div className="bg-muted/50 rounded-lg p-3 space-y-1.5">
                {orderItems.map(i => (
                  <div key={i.productId} className="flex justify-between text-sm">
                    <span>{i.name} x{i.quantity}</span>
                    <span className="font-medium">${(i.price * i.quantity).toFixed(2)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-sm font-bold pt-1.5 border-t border-border">
                  <span>合計</span>
                  <span>${total.toFixed(2)}</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input data-testid="input-order-notes" placeholder="特殊需求…" {...register("notes")} />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button className="min-h-11" type="button" variant="outline" onClick={() => { setShowCreate(false); setOrderItems([]); reset(); }}>取消</Button>
              <Button className="min-h-11" data-testid="button-submit-order" type="submit" disabled={createOrder.isPending || orderItems.length === 0}>
                {createOrder.isPending ? "建立中…" : `建立訂單（$${total.toFixed(2)}）`}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
