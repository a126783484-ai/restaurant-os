import { Link, useParams } from "wouter";
import { useGetOrder } from "@workspace/api-client-react";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const PAY_METHOD_LABELS: Record<string, string> = {
  unpaid: "未付款",
  cash: "現金",
  card: "刷卡",
  transfer: "轉帳",
  external: "外部支付",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

const STATUS_CLASS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  preparing: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  ready: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const PAY_CLASS: Record<string, string> = {
  unpaid: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  partially_paid: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  paid: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  refunded: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  cancelled: "bg-muted text-muted-foreground",
};

function formatMoney(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-TW", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function OrderReceipt() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);
  const { data: order, isLoading, error } = useGetOrder(orderId, {
    query: { enabled: Number.isFinite(orderId) },
  });

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">正在載入收據…</div>;
  }

  if (error || !order) {
    return (
      <div className="mx-auto max-w-xl p-6 text-center">
        <p className="text-sm text-muted-foreground">找不到此訂單，或目前無法讀取收據資料。</p>
        <Link href="/orders"><Button variant="link">返回訂單列表</Button></Link>
      </div>
    );
  }

  const paidAmount = order.paidAmount ?? (order.paymentStatus === "paid" ? order.totalAmount : 0);
  const balance = Math.max(order.totalAmount - paidAmount, 0);

  return (
    <div className="min-h-full bg-muted/30 p-4 sm:p-6 print:bg-white print:p-0">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between gap-3 print:hidden">
          <Link href={`/orders/${order.id}`}>
            <Button variant="ghost" className="gap-1.5 rounded-2xl">
              <ArrowLeft className="h-4 w-4" /> 返回訂單
            </Button>
          </Link>
          <Button onClick={() => window.print()} className="gap-1.5 rounded-2xl font-black">
            <Printer className="h-4 w-4" /> 列印收據
          </Button>
        </div>

        <main className="rounded-[2rem] border border-border bg-card p-6 shadow-sm print:rounded-none print:border-0 print:bg-white print:p-0 print:shadow-none">
          <header className="border-b border-border pb-5 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary print:hidden">
              <ReceiptText className="h-6 w-6" />
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground print:mt-0">Restaurant OS</h1>
            <p className="mt-1 text-sm text-muted-foreground">訂單收據 / Order Receipt</p>
          </header>

          <section className="grid grid-cols-1 gap-3 border-b border-border py-5 sm:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">訂單編號</p>
              <p className="mt-1 text-lg font-black text-foreground">#{order.id}</p>
            </div>
            <div className="sm:text-right">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">開單時間</p>
              <p className="mt-1 text-sm font-bold text-foreground">{formatDate(order.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">用餐型態</p>
              <p className="mt-1 text-sm font-bold text-foreground">
                {ORDER_TYPE_LABELS[order.type] ?? order.type}{order.tableId ? ` · ${order.tableId} 桌` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Badge className={cn("border-0 text-xs", STATUS_CLASS[order.status] ?? "bg-muted text-muted-foreground")}>{ORDER_STATUS_LABELS[order.status] ?? order.status}</Badge>
              <Badge className={cn("border-0 text-xs", PAY_CLASS[order.paymentStatus] ?? "bg-muted text-muted-foreground")}>{PAY_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</Badge>
            </div>
          </section>

          <section className="border-b border-border py-5">
            <div className="space-y-3">
              {order.items?.length ? order.items.map((item) => {
                const subtotal = item.unitPrice * item.quantity;
                return (
                  <div key={item.id} className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="font-black text-foreground">{item.productName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{formatMoney(item.unitPrice)} × {item.quantity}</p>
                      {item.notes && <p className="mt-1 text-xs text-muted-foreground">備註：{item.notes}</p>}
                    </div>
                    <p className="shrink-0 font-black text-foreground">{formatMoney(subtotal)}</p>
                  </div>
                );
              }) : <p className="text-sm text-muted-foreground">此訂單尚無品項資料。</p>}
            </div>
          </section>

          <section className="space-y-2 border-b border-border py-5">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">合計</span>
              <span className="font-black text-foreground">{formatMoney(order.totalAmount)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">付款方式</span>
              <span className="font-bold text-foreground">{PAY_METHOD_LABELS[order.paymentMethod ?? "unpaid"] ?? order.paymentMethod ?? "未付款"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">已收</span>
              <span className="font-black text-emerald-600">{formatMoney(paidAmount)}</span>
            </div>
            <div className="flex justify-between text-lg">
              <span className="font-black text-foreground">餘額</span>
              <span className={cn("font-black", balance > 0 ? "text-red-600" : "text-primary")}>{formatMoney(balance)}</span>
            </div>
          </section>

          {(order.notes || order.paymentNote) && (
            <section className="border-b border-border py-5 text-sm">
              {order.notes && <p><span className="font-black">訂單備註：</span>{order.notes}</p>}
              {order.paymentNote && <p className="mt-2"><span className="font-black">付款備註：</span>{order.paymentNote}</p>}
            </section>
          )}

          <footer className="pt-5 text-center text-xs text-muted-foreground">
            <p>感謝您的光臨</p>
            <p className="mt-1">Printed from Restaurant OS · {new Date().toLocaleString("zh-TW")}</p>
          </footer>
        </main>
      </div>
    </div>
  );
}
