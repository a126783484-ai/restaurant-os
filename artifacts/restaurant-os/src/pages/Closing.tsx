import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, DollarSign, ReceiptText, RefreshCcw, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { getClosingSummary, type ClosingOrder } from "@/lib/payments-api";
import { cn } from "@/lib/utils";
import { getSafeErrorMessage } from "@/lib/api-errors";

const RANGE_LABELS: Record<string, string> = {
  today: "今日",
  yesterday: "昨日",
  week: "本週",
  month: "本月",
};

const TYPE_LABELS: Record<string, string> = { "dine-in": "內用", takeout: "外帶" };
const STATUS_LABELS: Record<string, string> = { unpaid: "未付款", partially_paid: "部分付款", paid: "已付款", cancelled: "已取消" };

function formatMoney(value = 0) {
  return new Intl.NumberFormat("zh-TW", { style: "currency", currency: "TWD", maximumFractionDigits: 0 }).format(value);
}

function toDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

function getRange(range: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  if (range === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setHours(0, 0, 0, 0);
    end.setMilliseconds(-1);
  }
  if (range === "week") start.setDate(start.getDate() - start.getDay());
  if (range === "month") start.setDate(1);
  return { from: start.toISOString(), to: end.toISOString(), label: range === "today" ? toDateInput(now) : undefined };
}

function Metric({ label, value, tone = "default", icon: Icon = DollarSign }: { label: string; value: string | number; tone?: "default" | "success" | "danger" | "warning"; icon?: React.ElementType }) {
  return (
    <div className={cn("rounded-3xl border border-card-border bg-card p-4 shadow-sm", tone === "success" && "border-emerald-500/20 bg-emerald-500/5", tone === "danger" && "border-red-500/20 bg-red-500/5", tone === "warning" && "border-amber-500/20 bg-amber-500/5")}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-xl font-black text-foreground">{value}</p>
        </div>
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-4 w-4" /></span>
      </div>
    </div>
  );
}

function OrderList({ title, orders, tone }: { title: string; orders: ClosingOrder[]; tone: string }) {
  return (
    <div className="rounded-3xl border border-card-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between"><h2 className="font-black text-foreground">{title}</h2><Badge variant="outline">{orders.length} 筆</Badge></div>
      {orders.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm font-bold text-muted-foreground">沒有資料</p> : (
        <div className="space-y-2">
          {orders.slice(0, 8).map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`}>
              <div className="cursor-pointer rounded-2xl border border-border p-3 transition-colors hover:bg-muted/50">
                <div className="flex items-center justify-between gap-2"><p className="font-black">#{order.id} · {TYPE_LABELS[order.type] ?? order.type}{order.tableId ? ` · ${order.tableId}桌` : ""}</p><Badge className={cn("border-0", tone)}>{STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}</Badge></div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span>合計 <b>{formatMoney(order.totalAmount)}</b></span><span>已收 <b className="text-emerald-600">{formatMoney(order.paidAmount)}</b></span><span>餘額 <b className="text-red-600">{formatMoney(order.balance)}</b></span></div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Closing() {
  const [range, setRange] = useState("today");
  const queryParams = useMemo(() => {
    const computed = getRange(range);
    return range === "today" ? { date: computed.label } : { from: computed.from, to: computed.to };
  }, [range]);
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["closing-summary", queryParams], queryFn: () => getClosingSummary(queryParams) });

  return (
    <div className="mx-auto max-w-7xl space-y-5 overflow-x-hidden p-4 sm:p-6">
      <section className="relative overflow-hidden rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="pointer-events-none absolute -right-14 -top-20 h-52 w-52 rounded-full bg-primary/15 blur-3xl" />
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary"><CalendarDays className="h-3.5 w-3.5" /> Closing</div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground sm:text-3xl">日結 / 班結</h1>
            <p className="mt-1 text-sm text-muted-foreground">同一套付款紀錄邏輯統計應收、實收、未收、退款與取消付款。</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={range} onValueChange={setRange}><SelectTrigger className="min-h-12 rounded-2xl sm:w-40"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(RANGE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select>
            <Button variant="outline" className="min-h-12 rounded-2xl gap-2" onClick={() => refetch()}><RefreshCcw className="h-4 w-4" /> 重新整理</Button>
          </div>
        </div>
      </section>

      {error && <div className="flex flex-col gap-3 rounded-3xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm font-bold text-destructive sm:flex-row sm:items-center sm:justify-between"><span>{getSafeErrorMessage(error, "日結 API 無法讀取，請確認登入角色為 admin / manager 或稍後重試。")}</span><Button variant="outline" className="min-h-10 rounded-2xl" onClick={() => refetch()}>{isLoading ? "重試中…" : "重試"}</Button></div>}
      {isLoading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-28 animate-pulse rounded-3xl bg-muted" />)}</div> : data && <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label="今日應收" value={formatMoney(data.totalReceivable)} icon={ReceiptText} />
          <Metric label="今日實收" value={formatMoney(data.totalCollected)} tone="success" icon={Wallet} />
          <Metric label="今日未收" value={formatMoney(data.totalOutstanding)} tone={data.totalOutstanding > 0 ? "danger" : "success"} icon={DollarSign} />
          <Metric label="平均客單價" value={formatMoney(data.averageOrderValue)} />
          <Metric label="現金收入" value={formatMoney(data.cashTotal)} tone="success" />
          <Metric label="刷卡收入" value={formatMoney(data.cardTotal)} icon={CreditCard} />
          <Metric label="轉帳收入" value={formatMoney(data.transferTotal)} />
          <Metric label="外部支付" value={formatMoney(data.externalTotal)} />
          <Metric label="退款總額" value={formatMoney(data.refundedTotal)} tone={data.refundedTotal > 0 ? "warning" : "default"} />
          <Metric label="取消付款" value={formatMoney(data.cancelledPaymentTotal)} tone={data.cancelledPaymentTotal > 0 ? "warning" : "default"} />
          <Metric label="取消訂單" value={data.cancelledOrders} />
          <Metric label="訂單數" value={data.orderCount} />
        </div>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <OrderList title="未付款訂單" orders={data.unpaidOrderList} tone="bg-red-100 text-red-700" />
          <OrderList title="部分付款訂單" orders={data.partiallyPaidOrderList} tone="bg-amber-100 text-amber-700" />
          <OrderList title="已付款訂單" orders={data.paidOrderList} tone="bg-emerald-100 text-emerald-700" />
        </div>
        <div className="rounded-3xl border border-card-border bg-card p-4 shadow-sm">
          <h2 className="mb-3 font-black text-foreground">付款紀錄</h2>
          {data.payments.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-center text-sm font-bold text-muted-foreground">此範圍沒有付款紀錄</p> : <div className="space-y-2">{data.payments.slice(0, 20).map((payment) => <div key={payment.id} className="flex flex-col gap-1 rounded-2xl border border-border p-3 sm:flex-row sm:items-center sm:justify-between"><span className="font-black">#{payment.orderId} · {formatMoney(payment.amount)} · {payment.method}</span><span className="text-xs text-muted-foreground">{new Date(payment.createdAt).toLocaleString("zh-TW")} · {payment.status}</span></div>)}</div>}
        </div>
      </>}
      {!isLoading && !data && !error && <div className="rounded-3xl border border-dashed border-border bg-card p-6 text-center text-sm font-bold text-muted-foreground">目前沒有日結資料。</div>}
    </div>
  );
}
