import { useState } from "react";
import {
  useCreateTable,
  useListTables,
  useUpdateTable,
  getListTablesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { getToken } from "@/hooks/use-auth";
import { getApiUrl } from "@/lib/api-env";
import { getSafeErrorMessage } from "@/lib/api-errors";
import { cn } from "@/lib/utils";

type TableStatus = "available" | "occupied" | "reserved" | "cleaning";

type TableRow = {
  id: number;
  number: number;
  capacity: number;
  status: string;
  section: string;
  notes?: string | null;
};

const STATUS_OPTIONS: Array<{
  value: TableStatus;
  label: string;
  className: string;
}> = [
  { value: "available", label: "可用", className: "bg-emerald-500" },
  { value: "occupied", label: "使用中", className: "bg-red-500" },
  { value: "reserved", label: "已預約", className: "bg-amber-500" },
  { value: "cleaning", label: "清潔中", className: "bg-slate-400" },
];

const SECTION_OPTIONS = [
  { value: "main", label: "主廳" },
  { value: "窗邊", label: "窗邊區" },
  { value: "露台", label: "露台" },
  { value: "包廂", label: "包廂" },
];

function statusLabel(status: string) {
  return STATUS_OPTIONS.find((item) => item.value === status)?.label ?? status;
}

function statusDot(status: string) {
  return (
    STATUS_OPTIONS.find((item) => item.value === status)?.className ??
    "bg-muted"
  );
}

export default function TableManagement() {
  const { data: tables, isLoading } = useListTables();
  const createTable = useCreateTable();
  const updateTable = useUpdateTable();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [showCreate, setShowCreate] = useState(false);
  const [number, setNumber] = useState("");
  const [capacity, setCapacity] = useState("4");
  const [section, setSection] = useState("main");
  const [notes, setNotes] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const rows = ((tables ?? []) as TableRow[])
    .slice()
    .sort((a, b) => a.number - b.number);

  const resetCreate = () => {
    setShowCreate(false);
    setNumber("");
    setCapacity("4");
    setSection("main");
    setNotes("");
  };

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: getListTablesQueryKey() });
  };

  const submitCreate = () => {
    const parsedNumber = Number(number);
    const parsedCapacity = Number(capacity);

    if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
      toast({ title: "桌號必須是正整數", variant: "destructive" });
      return;
    }

    if (!Number.isInteger(parsedCapacity) || parsedCapacity <= 0) {
      toast({ title: "容納人數必須是正整數", variant: "destructive" });
      return;
    }

    createTable.mutate(
      {
        data: {
          number: parsedNumber,
          capacity: parsedCapacity,
          section,
          notes: notes || undefined,
        },
      },
      {
        onSuccess: () => {
          refresh();
          toast({ title: `已新增 ${parsedNumber} 號桌` });
          resetCreate();
        },
        onError: (error) =>
          toast({
            title: "新增桌位失敗",
            description: getSafeErrorMessage(
              error,
              "請確認桌號是否重複，或稍後再試。",
            ),
            variant: "destructive",
          }),
      },
    );
  };

  const changeStatus = (table: TableRow, status: string) => {
    updateTable.mutate(
      { id: table.id, data: { status } },
      {
        onSuccess: () => {
          refresh();
          toast({
            title: `${table.number} 號桌已更新為「${statusLabel(status)}」`,
          });
        },
        onError: (error) =>
          toast({
            title: "更新桌位狀態失敗",
            description: getSafeErrorMessage(
              error,
              "桌位狀態暫時無法更新，請稍後重試。",
            ),
            variant: "destructive",
          }),
      },
    );
  };

  const deleteTable = async (table: TableRow) => {
    const confirmed = window.confirm(
      `確認刪除 ${table.number} 號桌？此操作無法復原。`,
    );
    if (!confirmed) return;

    setDeletingId(table.id);
    try {
      const token = getToken();
      const response = await fetch(getApiUrl(`/api/tables/${table.id}`), {
        method: "DELETE",
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          code?: string;
          error?: { code?: string; message?: string } | string;
          message?: string;
        };
        const code =
          data.code ??
          (typeof data.error === "object" ? data.error.code : undefined);
        const message =
          code === "TABLE_HAS_ACTIVE_ORDER"
            ? "此桌仍有進行中訂單，不能刪除。"
            : code === "TABLE_HAS_ACTIVE_RESERVATION"
              ? "此桌仍有有效訂位，不能刪除。"
              : getSafeErrorMessage({ data }, "刪除桌位失敗。");
        throw new Error(message);
      }

      refresh();
      toast({ title: `已刪除 ${table.number} 號桌` });
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "刪除桌位失敗",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
      <section className="rounded-[2rem] border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
              <Users className="h-3.5 w-3.5" /> Table Control
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-foreground">
              桌位管理
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              新增桌位、調整狀態、刪除未使用桌位。
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={refresh}
              className="min-h-11 rounded-2xl gap-1.5"
            >
              <RefreshCw className="h-4 w-4" /> 重新整理
            </Button>
            <Button
              onClick={() => setShowCreate(true)}
              className="min-h-11 rounded-2xl gap-1.5 font-black"
            >
              <Plus className="h-4 w-4" /> 新增桌位
            </Button>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATUS_OPTIONS.map((option) => {
          const count = rows.filter(
            (table) => table.status === option.value,
          ).length;
          return (
            <div
              key={option.value}
              className="rounded-3xl border border-card-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn("h-2.5 w-2.5 rounded-full", option.className)}
                />
                <span className="text-xs font-bold text-muted-foreground">
                  {option.label}
                </span>
              </div>
              <p className="mt-2 text-2xl font-black text-foreground">
                {count}
              </p>
            </div>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[2rem] border border-card-border bg-card shadow-sm">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-20 animate-pulse rounded-2xl bg-muted"
              />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-muted-foreground">
            尚未建立桌位，請按「新增桌位」。
          </div>
        ) : (
          <div className="divide-y divide-border">
            {rows.map((table) => (
              <div
                key={table.id}
                className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xl font-black text-foreground">
                      {table.number} 號桌
                    </p>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                      {table.capacity} 人
                    </span>
                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-bold text-muted-foreground">
                      {table.section}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs font-bold text-muted-foreground">
                    <span
                      className={cn(
                        "h-2.5 w-2.5 rounded-full",
                        statusDot(table.status),
                      )}
                    />
                    {statusLabel(table.status)}
                    {table.notes && (
                      <span className="truncate">· {table.notes}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <Select
                    value={table.status}
                    onValueChange={(value) => changeStatus(table, value)}
                  >
                    <SelectTrigger className="min-h-11 rounded-2xl sm:w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    className="min-h-11 rounded-2xl gap-1.5 text-destructive hover:text-destructive"
                    onClick={() => deleteTable(table)}
                    disabled={deletingId === table.id}
                  >
                    <Trash2 className="h-4 w-4" />{" "}
                    {deletingId === table.id ? "刪除中…" : "刪除"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Dialog
        open={showCreate}
        onOpenChange={(open) => (open ? setShowCreate(true) : resetCreate())}
      >
        <DialogContent className="w-[calc(100vw-2rem)] max-w-md rounded-3xl">
          <DialogHeader>
            <DialogTitle>新增桌位</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">桌號</label>
              <Input
                type="number"
                min="1"
                value={number}
                onChange={(event) => setNumber(event.target.value)}
                placeholder="例如：5"
                className="min-h-11 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">容納人數</label>
              <Input
                type="number"
                min="1"
                value={capacity}
                onChange={(event) => setCapacity(event.target.value)}
                className="min-h-11 rounded-2xl"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">區域</label>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger className="min-h-11 rounded-2xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTION_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="可留空"
                className="min-h-11 rounded-2xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={resetCreate}
              className="min-h-11 rounded-2xl"
            >
              取消
            </Button>
            <Button
              onClick={submitCreate}
              disabled={createTable.isPending}
              className="min-h-11 rounded-2xl font-black"
            >
              {createTable.isPending ? "新增中…" : "新增桌位"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
