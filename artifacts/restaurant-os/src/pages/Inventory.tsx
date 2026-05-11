import { useState } from "react";
import {
  useListInventory,
  useCreateInventory,
  useUpdateInventory,
  useDeleteInventory,
  getListInventoryQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, AlertTriangle, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";

const CATEGORIES = ["全部", "蔬菜", "肉類", "海鮮", "乾貨", "調味料", "飲料原料", "包裝材料", "其他"];

interface InventoryForm {
  name: string;
  category: string;
  unit: string;
  quantity: number;
  minQuantity: number;
  cost: number;
  supplier: string;
  notes: string;
}

interface AdjustForm {
  quantity: number;
  notes: string;
}

function InventoryRow({ item, onAdjust, onDelete }: {
  item: { id: number; name: string; category: string; unit: string; quantity: number; minQuantity: number; cost: number; supplier?: string | null; notes?: string | null };
  onAdjust: () => void;
  onDelete: () => void;
}) {
  const isLow = item.quantity <= item.minQuantity;
  const isCritical = item.quantity <= item.minQuantity * 0.5;

  return (
    <div
      data-testid={`inventory-${item.id}`}
      className={cn(
        "flex items-center gap-4 px-5 py-3.5 border-b border-border last:border-0 transition-colors",
        isLow ? "bg-red-50/50 dark:bg-red-950/20" : "hover:bg-muted/30"
      )}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold text-foreground">{item.name}</p>
          {isCritical && (
            <Badge className="text-[10px] border-0 bg-red-500 text-white gap-0.5 px-1.5">
              <AlertTriangle className="h-2.5 w-2.5" /> 嚴重不足
            </Badge>
          )}
          {isLow && !isCritical && (
            <Badge className="text-[10px] border-0 bg-amber-500 text-white">
              庫存偏低
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          <span className="text-xs text-muted-foreground">{item.category}</span>
          {item.supplier && <span className="text-xs text-muted-foreground">供應商：{item.supplier}</span>}
        </div>
      </div>

      <div className="hidden sm:flex items-center gap-6 shrink-0 text-right">
        <div>
          <p className="text-xs text-muted-foreground">庫存</p>
          <p className={cn("text-sm font-bold", isLow ? "text-red-600 dark:text-red-400" : "text-foreground")}>
            {item.quantity} {item.unit}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">最低庫存</p>
          <p className="text-sm font-semibold text-muted-foreground">{item.minQuantity} {item.unit}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">成本</p>
          <p className="text-sm font-semibold text-foreground">${item.cost.toFixed(0)}/{item.unit}</p>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onAdjust}>
          調整
        </Button>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function Inventory() {
  const [categoryFilter, setCategoryFilter] = useState("全部");
  const [showLowStock, setShowLowStock] = useState(false);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [adjustItem, setAdjustItem] = useState<{ id: number; name: string; quantity: number; unit: string } | null>(null);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: items, isLoading } = useListInventory({
    category: categoryFilter !== "全部" ? categoryFilter : undefined,
    lowStock: showLowStock ? "true" : undefined,
  });

  const createItem = useCreateInventory();
  const updateItem = useUpdateInventory();
  const deleteItem = useDeleteInventory();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<InventoryForm>({
    defaultValues: { category: "其他", unit: "個", quantity: 0, minQuantity: 0, cost: 0 },
  });
  const adjustForm = useForm<AdjustForm>();

  const filtered = (items ?? []).filter(i =>
    search ? i.name.toLowerCase().includes(search.toLowerCase()) : true
  );

  const lowStockCount = (items ?? []).filter(i => i.quantity <= i.minQuantity).length;

  const onSubmit = (data: InventoryForm) => {
    createItem.mutate(
      { data: { name: data.name, category: data.category, unit: data.unit, quantity: Number(data.quantity), minQuantity: Number(data.minQuantity), cost: Number(data.cost), supplier: data.supplier || undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          setShowCreate(false);
          reset();
          toast({ title: "品項已新增" });
        },
        onError: () => toast({ title: "新增失敗", variant: "destructive" }),
      }
    );
  };

  const onAdjust = (data: AdjustForm) => {
    if (!adjustItem) return;
    updateItem.mutate(
      { id: adjustItem.id, data: { quantity: Number(data.quantity) } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() });
          setAdjustItem(null);
          adjustForm.reset();
          toast({ title: "庫存已更新" });
        },
        onError: () => toast({ title: "更新失敗", variant: "destructive" }),
      }
    );
  };

  const onDelete = (id: number) => {
    deleteItem.mutate(
      { id },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListInventoryQueryKey() }); toast({ title: "品項已刪除" }); },
        onError: () => toast({ title: "刪除失敗", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">庫存管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "載入中…" : `共 ${items?.length ?? 0} 項${lowStockCount > 0 ? ` · ${lowStockCount} 項庫存不足` : ""}`}
          </p>
        </div>
        <Button data-testid="button-add-inventory" onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增品項
        </Button>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="搜尋品項…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <button
          onClick={() => setShowLowStock(!showLowStock)}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
            showLowStock
              ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800"
              : "bg-background border-border text-muted-foreground hover:bg-muted"
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" /> 庫存不足
          {lowStockCount > 0 && (
            <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {lowStockCount}
            </span>
          )}
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              categoryFilter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-2.5 bg-muted/40 border-b border-border text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          <span className="flex-1">品項</span>
          <div className="hidden sm:flex items-center gap-6 shrink-0">
            <span className="w-20 text-right">庫存</span>
            <span className="w-20 text-right">最低</span>
            <span className="w-20 text-right">單位成本</span>
          </div>
          <span className="w-20" />
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted animate-pulse rounded w-32" />
                  <div className="h-3 bg-muted animate-pulse rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          filtered.map(item => (
            <InventoryRow
              key={item.id}
              item={item}
              onAdjust={() => { setAdjustItem({ id: item.id, name: item.name, quantity: item.quantity, unit: item.unit }); adjustForm.setValue("quantity", item.quantity); }}
              onDelete={() => onDelete(item.id)}
            />
          ))
        ) : (
          <div className="py-16 text-center">
            <Package className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">尚無庫存品項</p>
            <p className="text-xs text-muted-foreground mt-1">新增第一個品項開始管理庫存</p>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增庫存品項</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">品項名稱 *</label>
              <Input placeholder="例：花生油" {...register("name", { required: true })} className={cn(errors.name && "border-destructive")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">分類 *</label>
                <Controller control={control} name="category" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.filter(c => c !== "全部").map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">單位 *</label>
                <Input placeholder="例：瓶、公斤、個" {...register("unit", { required: true })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">目前庫存</label>
                <Input type="number" step="0.1" min="0" {...register("quantity")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">最低庫存</label>
                <Input type="number" step="0.1" min="0" {...register("minQuantity")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">單位成本</label>
                <Input type="number" step="0.01" min="0" {...register("cost")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">供應商</label>
              <Input placeholder="供應商名稱" {...register("supplier")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input placeholder="儲存條件、注意事項…" {...register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button type="submit" disabled={createItem.isPending}>
                {createItem.isPending ? "新增中…" : "新增品項"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjustItem} onOpenChange={open => { if (!open) { setAdjustItem(null); adjustForm.reset(); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>調整庫存 — {adjustItem?.name}</DialogTitle></DialogHeader>
          <form onSubmit={adjustForm.handleSubmit(onAdjust)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">新庫存數量（{adjustItem?.unit}）</label>
              <Input type="number" step="0.1" min="0" {...adjustForm.register("quantity", { required: true, min: 0 })} />
              <p className="text-xs text-muted-foreground">目前庫存：{adjustItem?.quantity} {adjustItem?.unit}</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註（選填）</label>
              <Input placeholder="調整原因…" {...adjustForm.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAdjustItem(null)}>取消</Button>
              <Button type="submit" disabled={updateItem.isPending}>
                {updateItem.isPending ? "更新中…" : "確認調整"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
