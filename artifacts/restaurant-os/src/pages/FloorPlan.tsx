import { useState } from "react";
import {
  useListTables,
  useListReservations,
  useListOrders,
  useUpdateTable,
  getListTablesQueryKey,
  getListReservationsQueryKey,
  getListOrdersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { Users, CalendarDays, ShoppingBag, RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

const STATUS_CONFIG: Record<TableStatus, { label: string; bg: string; border: string; dot: string; text: string }> = {
  available: {
    label: "可用",
    bg: "bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-950/60",
    border: "border-emerald-300 dark:border-emerald-700",
    dot: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  occupied: {
    label: "使用中",
    bg: "bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/60",
    border: "border-red-300 dark:border-red-700",
    dot: "bg-red-500",
    text: "text-red-700 dark:text-red-400",
  },
  reserved: {
    label: "已預約",
    bg: "bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-950/60",
    border: "border-amber-300 dark:border-amber-700",
    dot: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-400",
  },
  cleaning: {
    label: "清潔中",
    bg: "bg-slate-50 dark:bg-slate-900/40 hover:bg-slate-100 dark:hover:bg-slate-900/60",
    border: "border-slate-300 dark:border-slate-600",
    dot: "bg-slate-400",
    text: "text-slate-600 dark:text-slate-400",
  },
};

const SECTION_LABELS: Record<string, string> = {
  main: "主廳",
  主廳: "主廳",
  窗邊: "窗邊區",
  露台: "露台",
  包廂: "包廂",
};

const DEFAULT_SECTION_ORDER = ["main", "主廳", "窗邊", "露台", "包廂"];

const RESERVATION_STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  seated: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const RESERVATION_STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  seated: "已入座",
  completed: "已完成",
  cancelled: "已取消",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "待處理",
  preparing: "準備中",
  ready: "已備妥",
  completed: "已完成",
};

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

const PAY_STATUS_LABELS: Record<string, string> = {
  unpaid: "未付款",
  paid: "已付款",
  refunded: "已退款",
};

type TableType = {
  id: number;
  number: number;
  capacity: number;
  status: string;
  section: string;
  notes?: string | null;
};

type ReservationType = {
  id: number;
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: string;
  status: string;
  tableId?: number | null;
  notes?: string | null;
};

type OrderType = {
  id: number;
  tableId?: number | null;
  status: string;
  type: string;
  totalAmount: number;
  paymentStatus: string;
  createdAt: string;
};

function getSectionLabel(section: string | null | undefined): string {
  const normalized = section?.trim() || "main";
  return SECTION_LABELS[normalized] ?? normalized;
}

function buildSections(tables: TableType[]) {
  const sectionSet = new Set(tables.map((table) => table.section?.trim() || "main"));
  const ordered = [
    ...DEFAULT_SECTION_ORDER.filter((section) => sectionSet.has(section)),
    ...Array.from(sectionSet).filter((section) => !DEFAULT_SECTION_ORDER.includes(section)),
  ];

  return ordered.map((section) => ({ key: section, cols: section === "main" || section === "主廳" ? "grid-cols-2" : "grid-cols-2" }));
}

function TableCard({
  table,
  reservation,
  order,
  isSelected,
  onClick,
}: {
  table: TableType;
  reservation?: ReservationType;
  order?: OrderType;
  isSelected: boolean;
  onClick: () => void;
}) {
  const cfg = STATUS_CONFIG[table.status as TableStatus] ?? STATUS_CONFIG.available;

  return (
    <button
      data-testid={`table-card-${table.number}`}
      onClick={onClick}
      className={cn(
        "relative w-full min-h-32 rounded-xl border-2 p-4 flex flex-col items-center justify-center gap-2 transition-all duration-150 cursor-pointer select-none",
        cfg.bg,
        cfg.border,
        isSelected && "ring-2 ring-primary ring-offset-2 scale-[1.03] shadow-lg"
      )}
    >
      <span className={cn("absolute top-3 right-3 w-3 h-3 rounded-full", cfg.dot)} />
      <span className="text-3xl font-black text-foreground leading-none">{table.number}</span>
      <span className={cn("text-xs font-semibold uppercase tracking-wider", cfg.text)}>
        {table.capacity} 人
      </span>
      {(reservation || order) && (
        <div className="flex items-center gap-1 mt-1">
          {reservation && <CalendarDays className="h-4 w-4 text-amber-500" />}
          {order && <ShoppingBag className="h-4 w-4 text-blue-500" />}
        </div>
      )}
    </button>
  );
}

function DetailPanel({
  table,
  reservation,
  order,
  onClose,
  onStatusChange,
}: {
  table: TableType;
  reservation?: ReservationType;
  order?: OrderType;
  onClose: () => void;
  onStatusChange: (id: number, status: string) => void;
}) {
  const cfg = STATUS_CONFIG[table.status as TableStatus] ?? STATUS_CONFIG.available;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-start justify-between p-5 border-b border-border">
        <div>
          <h2 className="text-lg font-bold text-foreground">{table.number} 號桌</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn("text-xs font-semibold", cfg.text)}>{cfg.label}</span>
            <span className="text-xs text-muted-foreground">&middot; {table.capacity} 人 &middot; {getSectionLabel(table.section)}</span>
          </div>
        </div>
        <button onClick={onClose} className="p-1 rounded-md hover:bg-muted transition-colors text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">桌位狀態</p>
          <Select value={table.status} onValueChange={(val) => onStatusChange(table.id, val)}>
            <SelectTrigger data-testid={`select-table-status-${table.id}`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">可用</SelectItem>
              <SelectItem value="occupied">使用中</SelectItem>
              <SelectItem value="reserved">已預約</SelectItem>
              <SelectItem value="cleaning">清潔中</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" /> 訂位資訊
          </p>
          {reservation ? (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">{reservation.customerName}</p>
                <Badge className={cn("text-[10px] border-0", RESERVATION_STATUS_COLORS[reservation.status] ?? "bg-muted text-muted-foreground")}>
                  {RESERVATION_STATUS_LABELS[reservation.status] ?? reservation.status}
                </Badge>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p className="flex items-center gap-1.5"><Users className="h-3 w-3" />{reservation.partySize} 人</p>
                <p className="flex items-center gap-1.5">
                  <CalendarDays className="h-3 w-3" />
                  {new Date(reservation.reservedAt).toLocaleString("zh-TW", {
                    month: "short", day: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
                <p>{reservation.customerPhone}</p>
                {reservation.notes && <p className="italic">「{reservation.notes}」</p>}
              </div>
              <Link href="/reservations">
                <Button variant="outline" size="sm" className="w-full mt-1 h-7 text-xs">前往訂位管理</Button>
              </Link>
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">此桌無訂位</p>
              <Link href="/reservations">
                <Button variant="link" size="sm" className="text-xs h-auto p-0 mt-1">新增訂位</Button>
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
            <ShoppingBag className="h-3.5 w-3.5" /> 當前訂單
          </p>
          {order ? (
            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">訂單 #{order.id}</p>
                <div className="flex gap-1.5">
                  <Badge className={cn("text-[10px] border-0", {
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300": order.status === "pending",
                    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300": order.status === "preparing",
                    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300": order.status === "ready",
                    "bg-muted text-muted-foreground": order.status === "completed",
                  })}>
                    {ORDER_STATUS_LABELS[order.status] ?? order.status}
                  </Badge>
                  <Badge className={cn("text-[10px] border-0", {
                    "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300": order.paymentStatus === "unpaid",
                    "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300": order.paymentStatus === "paid",
                  })}>
                    {PAY_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus}
                  </Badge>
                </div>
              </div>
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{ORDER_TYPE_LABELS[order.type] ?? order.type}</p>
                <p>開單時間：{new Date(order.createdAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</p>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-blue-200 dark:border-blue-800">
                <span className="text-sm font-bold text-foreground">${order.totalAmount.toFixed(2)}</span>
                <Link href={`/orders/${order.id}`}>
                  <Button variant="outline" size="sm" className="h-7 text-xs">查看訂單</Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-border rounded-lg p-4 text-center">
              <p className="text-xs text-muted-foreground">此桌無進行中訂單</p>
              <Link href="/orders">
                <Button variant="link" size="sm" className="text-xs h-auto p-0 mt-1">建立訂單</Button>
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function FloorPlan() {
  const [selectedTableId, setSelectedTableId] = useState<number | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const today = new Date().toISOString().split("T")[0];

  const { data: tables, isLoading: tablesLoading } = useListTables();
  const { data: reservations } = useListReservations({ date: today });
  const { data: pendingOrders } = useListOrders({ status: "pending" });
  const { data: preparingOrders } = useListOrders({ status: "preparing" });
  const { data: readyOrders } = useListOrders({ status: "ready" });

  const updateTable = useUpdateTable();
  const normalizedTables = (tables ?? []) as TableType[];
  const sections = buildSections(normalizedTables);

  const activeOrders: OrderType[] = [
    ...(pendingOrders ?? []),
    ...(preparingOrders ?? []),
    ...(readyOrders ?? []),
  ];

  const reservationByTable = new Map<number, ReservationType>();
  for (const r of (reservations ?? [])) {
    if (r.tableId && (r.status === "confirmed" || r.status === "pending" || r.status === "seated")) {
      reservationByTable.set(r.tableId, r as ReservationType);
    }
  }

  const orderByTable = new Map<number, OrderType>();
  for (const o of activeOrders) {
    if (o.tableId) {
      orderByTable.set(o.tableId, o as OrderType);
    }
  }

  const selectedTable = normalizedTables.find(t => t.id === selectedTableId) ?? null;
  const selectedReservation = selectedTableId ? reservationByTable.get(selectedTableId) : undefined;
  const selectedOrder = selectedTableId ? orderByTable.get(selectedTableId) : undefined;

  const onStatusChange = (id: number, status: string) => {
    updateTable.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
          toast({ title: `桌位狀態已更新為「${STATUS_CONFIG[status as TableStatus]?.label ?? status}」` });
        },
        onError: () => toast({ title: "更新失敗", variant: "destructive" }),
      }
    );
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey() });
    queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey() });
    toast({ title: "樓層平面圖已更新" });
  };

  const counts = normalizedTables.reduce(
    (acc, t) => {
      acc[t.status as TableStatus] = (acc[t.status as TableStatus] ?? 0) + 1;
      return acc;
    },
    {} as Record<TableStatus, number>
  );

  return (
    <div className="flex h-full overflow-hidden">
      <div className={cn("flex-1 flex flex-col overflow-hidden transition-all duration-300")}>
        <div className="px-6 pt-6 pb-4 border-b border-border bg-background/80 backdrop-blur-sm shrink-0">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-foreground">樓層平面圖</h1>
              <p className="text-sm text-muted-foreground mt-0.5">即時桌位狀態 — 點擊桌位查看詳情</p>
            </div>
            <Button variant="outline" size="sm" onClick={refresh} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" /> 重新整理
            </Button>
          </div>

          <div className="flex flex-wrap gap-4 mt-4">
            {(Object.entries(STATUS_CONFIG) as [TableStatus, typeof STATUS_CONFIG[TableStatus]][]).map(([status, cfg]) => (
              <div key={status} className="flex items-center gap-1.5">
                <span className={cn("w-2.5 h-2.5 rounded-full", cfg.dot)} />
                <span className="text-xs text-muted-foreground">{cfg.label}</span>
                <span className="text-xs font-bold text-foreground">{counts[status] ?? 0}</span>
              </div>
            ))}
            <div className="flex items-center gap-1.5 ml-2 pl-2 border-l border-border">
              <CalendarDays className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs text-muted-foreground">今日訂位：</span>
              <span className="text-xs font-bold text-foreground">{reservations?.length ?? 0}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <ShoppingBag className="h-3.5 w-3.5 text-blue-500" />
              <span className="text-xs text-muted-foreground">進行中訂單：</span>
              <span className="text-xs font-bold text-foreground">{activeOrders.length}</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tablesLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="min-h-32 bg-muted animate-pulse rounded-xl" />
              ))}
            </div>
          ) : normalizedTables.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              尚未建立桌位。請先在資料庫或桌位管理建立桌位資料。
            </div>
          ) : (
            <div className="space-y-8 max-w-4xl pb-10">
              {sections.map(section => {
                const sectionTables = normalizedTables.filter(t => (t.section?.trim() || "main") === section.key);
                if (sectionTables.length === 0) return null;
                return (
                  <div key={section.key}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-foreground">{getSectionLabel(section.key)}</span>
                        <span className="text-xs text-muted-foreground">（{sectionTables.length} 桌）</span>
                      </div>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                      {sectionTables
                        .sort((a, b) => a.number - b.number)
                        .map(table => (
                          <TableCard
                            key={table.id}
                            table={table}
                            reservation={reservationByTable.get(table.id)}
                            order={orderByTable.get(table.id)}
                            isSelected={selectedTableId === table.id}
                            onClick={() => setSelectedTableId(selectedTableId === table.id ? null : table.id)}
                          />
                        ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className={cn(
          "shrink-0 border-l border-border bg-card overflow-hidden transition-all duration-300 ease-in-out",
          selectedTable ? "w-80 opacity-100" : "w-0 opacity-0 pointer-events-none"
        )}
      >
        {selectedTable && (
          <DetailPanel
            table={selectedTable}
            reservation={selectedReservation}
            order={selectedOrder}
            onClose={() => setSelectedTableId(null)}
            onStatusChange={onStatusChange}
          />
        )}
      </div>
    </div>
  );
}
