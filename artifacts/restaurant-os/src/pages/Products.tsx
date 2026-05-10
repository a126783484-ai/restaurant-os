import { useState } from "react";
import {
  useListProducts,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, UtensilsCrossed, ToggleLeft, ToggleRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  Main: "主菜",
  Starter: "前菜",
  Dessert: "甜點",
  Beverage: "飲料",
};

const CATEGORY_COLORS: Record<string, string> = {
  Main: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  Starter: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  Dessert: "bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300",
  Beverage: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};

const CATEGORIES = ["All", "Main", "Starter", "Dessert", "Beverage"];
const CATEGORY_FILTER_LABELS: Record<string, string> = {
  All: "全部",
  Main: "主菜",
  Starter: "前菜",
  Dessert: "甜點",
  Beverage: "飲料",
};

interface ProductForm { name: string; price: number; category: string; description: string; }

export default function Products() {
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: products, isLoading } = useListProducts({
    category: categoryFilter !== "All" ? categoryFilter : undefined,
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const deleteProduct = useDeleteProduct();

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<ProductForm>({
    defaultValues: { category: "Main" },
  });

  const onSubmit = (data: ProductForm) => {
    createProduct.mutate(
      { data: { name: data.name, price: Number(data.price), category: data.category, description: data.description || undefined, available: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          setShowCreate(false);
          reset();
          toast({ title: "品項已新增" });
        },
        onError: () => toast({ title: "新增品項失敗", variant: "destructive" }),
      }
    );
  };

  const toggleAvailability = (id: number, current: boolean) => {
    updateProduct.mutate(
      { id, data: { available: !current } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          toast({ title: current ? "品項已設為無法供應" : "品項已開放供應" });
        },
        onError: () => toast({ title: "更新失敗", variant: "destructive" }),
      }
    );
  };

  const onDelete = (id: number) => {
    deleteProduct.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          toast({ title: "品項已刪除" });
        },
        onError: () => toast({ title: "刪除失敗", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">菜單管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "載入中…" : `共 ${products?.length ?? 0} 項品項`}
          </p>
        </div>
        <Button data-testid="button-add-product" onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增品項
        </Button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            data-testid={`filter-category-${cat}`}
            onClick={() => setCategoryFilter(cat)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              categoryFilter === cat
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            )}
          >
            {CATEGORY_FILTER_LABELS[cat] ?? cat}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-36 bg-muted animate-pulse rounded-xl" />
          ))}
        </div>
      ) : products && products.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map(p => (
            <div
              key={p.id}
              data-testid={`card-product-${p.id}`}
              className={cn("bg-card border border-card-border rounded-xl p-4 flex flex-col gap-3 transition-opacity", !p.available && "opacity-60")}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground leading-tight">{p.name}</p>
                  {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{p.description}</p>}
                </div>
                <Badge className={cn("text-[10px] border-0 shrink-0", CATEGORY_COLORS[p.category] ?? "bg-muted text-muted-foreground")}>
                  {CATEGORY_LABELS[p.category] ?? p.category}
                </Badge>
              </div>
              <div className="flex items-center justify-between mt-auto">
                <span className="text-lg font-bold text-foreground">${p.price.toFixed(2)}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    data-testid={`button-toggle-${p.id}`}
                    onClick={() => toggleAvailability(p.id, p.available)}
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title={p.available ? "設為無法供應" : "開放供應"}
                  >
                    {p.available
                      ? <ToggleRight className="h-6 w-6 text-primary" />
                      : <ToggleLeft className="h-6 w-6" />}
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => onDelete(p.id)}
                    data-testid={`button-delete-product-${p.id}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              {!p.available && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">暫停供應</span>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="py-16 text-center">
          <UtensilsCrossed className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium text-foreground">此分類無品項</p>
          <p className="text-xs text-muted-foreground mt-1">新增第一個菜單品項以開始使用</p>
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增菜單品項</DialogTitle></DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">品項名稱 *</label>
              <Input data-testid="input-product-name" placeholder="例：香煎鮭魚" {...register("name", { required: true })} className={cn(errors.name && "border-destructive")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">售價 *</label>
                <Input data-testid="input-product-price" type="number" step="0.01" min="0" placeholder="0.00" {...register("price", { required: true, min: 0 })} className={cn(errors.price && "border-destructive")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">分類 *</label>
                <Controller control={control} name="category" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger data-testid="select-product-category"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">描述</label>
              <Input data-testid="input-product-description" placeholder="簡短說明…" {...register("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button data-testid="button-submit-product" type="submit" disabled={createProduct.isPending}>
                {createProduct.isPending ? "新增中…" : "新增品項"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
