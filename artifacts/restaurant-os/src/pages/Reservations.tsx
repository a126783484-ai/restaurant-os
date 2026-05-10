import { useState } from "react";
import {
  useListReservations,
  useCreateReservation,
  useUpdateReservation,
  useDeleteReservation,
  useListTables,
  getListReservationsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, CalendarDays, Users, Clock, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  pending: "待確認",
  confirmed: "已確認",
  seated: "已入座",
  completed: "已完成",
  cancelled: "已取消",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  confirmed: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  seated: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  completed: "bg-muted text-muted-foreground",
  cancelled: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

interface ResForm {
  customerName: string;
  customerPhone: string;
  partySize: number;
  reservedAt: string;
  tableId: string;
  notes: string;
}

export default function Reservations() {
  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(today);
  const [statusFilter, setStatusFilter] = useState("all");
  const [showCreate, setShowCreate] = useState(false);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: reservations, isLoading } = useListReservations({
    date: date || undefined,
    status: statusFilter !== "all" ? statusFilter : undefined,
  });
  const { data: tables } = useListTables();
  const createRes = useCreateReservation();
  const updateRes = useUpdateReservation();
  const deleteRes = useDeleteReservation();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ResForm>();

  const invalidate = () => queryClient.invalidateQueries({ queryKey: getListReservationsQueryKey() });

  const onSubmit = (data: ResForm) => {
    const dateTimeStr = `${data.reservedAt}:00`;
    createRes.mutate(
      { data: { customerName: data.customerName, customerPhone: data.customerPhone, partySize: Number(data.partySize), reservedAt: dateTimeStr, tableId: (data.tableId && data.tableId !== "__none__") ? Number(data.tableId) : undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => { invalidate(); setShowCreate(false); reset(); toast({ title: "訂位已建立" }); },
        onError: () => toast({ title: "建立訂位失敗", variant: "destructive" }),
      }
    );
  };

  const updateStatus = (id: number, status: string) => {
    updateRes.mutate(
      { id, data: { status } },
      {
        onSuccess: () => { invalidate(); toast({ title: `狀態已更新為「${STATUS_LABELS[status] ?? status}」` }); },
        onError: () => toast({ title: "更新失敗", variant: "destructive" }),
      }
    );
  };

  const onDelete = (id: number) => {
    deleteRes.mutate(
      { id },
      {
        onSuccess: () => { invalidate(); toast({ title: "訂位已取消" }); },
        onError: () => toast({ title: "取消失敗", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">訂位管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{isLoading ? "載入中…" : `共 ${reservations?.length ?? 0} 筆訂位`}</p>
        </div>
        <Button data-testid="button-new-reservation" onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增訂位
        </Button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <Input
          data-testid="input-reservation-date"
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-44"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger data-testid="select-status-filter" className="w-40">
            <SelectValue placeholder="所有狀態" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">所有狀態</SelectItem>
            <SelectItem value="pending">待確認</SelectItem>
            <SelectItem value="confirmed">已確認</SelectItem>
            <SelectItem value="seated">已入座</SelectItem>
            <SelectItem value="completed">已完成</SelectItem>
            <SelectItem value="cancelled">已取消</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 animate-pulse bg-muted/30 m-2 rounded-lg" />)}
          </div>
        ) : reservations && reservations.length > 0 ? (
          <div className="divide-y divide-border">
            {reservations.map(r => (
              <div key={r.id} data-testid={`reservation-${r.id}`} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-foreground">{r.customerName}</p>
                    <Badge className={cn("text-[10px] border-0", STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground")}>
                      {STATUS_LABELS[r.status] ?? r.status}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-3 mt-1">
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Users className="h-3 w-3" />{r.partySize} 人</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" />{new Date(r.reservedAt).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="text-xs text-muted-foreground">{r.customerPhone}</span>
                    {r.notes && <span className="text-xs text-muted-foreground italic">{r.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={r.status} onValueChange={val => updateStatus(r.id, val)}>
                    <SelectTrigger data-testid={`select-status-${r.id}`} className="h-8 text-xs w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(STATUS_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(r.id)} data-testid={`button-delete-reservation-${r.id}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-16 text-center">
            <CalendarDays className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">此日期無訂位紀錄</p>
            <p className="text-xs text-muted-foreground mt-1">建立新的訂位以開始使用</p>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增訂位</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">賓客姓名 *</label>
                <Input data-testid="input-res-name" {...register("customerName", { required: true })} className={cn(errors.customerName && "border-destructive")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">電話 *</label>
                <Input data-testid="input-res-phone" {...register("customerPhone", { required: true })} className={cn(errors.customerPhone && "border-destructive")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">日期與時間 *</label>
                <Input data-testid="input-res-datetime" type="datetime-local" {...register("reservedAt", { required: true })} className={cn(errors.reservedAt && "border-destructive")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">用餐人數 *</label>
                <Input data-testid="input-res-party" type="number" min={1} max={20} defaultValue={2} {...register("partySize", { required: true, min: 1 })} className={cn(errors.partySize && "border-destructive")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">桌次（選填）</label>
              <Controller control={control} name="tableId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger data-testid="select-res-table"><SelectValue placeholder="自動分配" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">自動分配</SelectItem>
                    {(tables ?? []).filter(t => t.status === "available").map(t => (
                      <SelectItem key={t.id} value={String(t.id)}>{t.number} 號桌 — {t.section}（{t.capacity} 人）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input data-testid="input-res-notes" placeholder="特殊需求…" {...register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button data-testid="button-submit-reservation" type="submit" disabled={createRes.isPending}>
                {createRes.isPending ? "建立中…" : "建立訂位"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
