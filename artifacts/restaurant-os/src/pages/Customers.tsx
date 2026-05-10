import { useState } from "react";
import { Link } from "wouter";
import { useListCustomers, useCreateCustomer, getListCustomersQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Search, Plus, Star, Phone, Mail, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NewCustomerForm {
  name: string;
  phone: string;
  email: string;
  notes: string;
}

function CustomerRow({ customer }: { customer: { id: number; name: string; phone: string; email: string | null; loyaltyPoints: number; totalSpend: number; visitCount: number; tags: string[] } }) {
  return (
    <Link href={`/customers/${customer.id}`}>
      <div data-testid={`row-customer-${customer.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-muted/50 transition-colors cursor-pointer border-b border-border last:border-b-0">
        <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
          <span className="text-sm font-bold text-primary">{customer.name.charAt(0)}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground">{customer.name}</p>
            {customer.tags.includes("VIP") && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0">VIP</Badge>
            )}
          </div>
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />{customer.phone}</span>
            {customer.email && <span className="text-xs text-muted-foreground flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{customer.email}</span>}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-6 text-right shrink-0">
          <div>
            <p className="text-xs text-muted-foreground">造訪次數</p>
            <p className="text-sm font-semibold">{customer.visitCount}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">消費金額</p>
            <p className="text-sm font-semibold">${customer.totalSpend.toFixed(0)}</p>
          </div>
          <div className="flex items-center gap-1 text-amber-500">
            <Star className="h-3.5 w-3.5 fill-current" />
            <span className="text-sm font-semibold text-foreground">{customer.loyaltyPoints}</span>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </div>
    </Link>
  );
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const { data: customers, isLoading } = useListCustomers({ search: search || undefined });
  const createCustomer = useCreateCustomer();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<NewCustomerForm>();

  const onSubmit = (data: NewCustomerForm) => {
    createCustomer.mutate(
      { data: { name: data.name, phone: data.phone, email: data.email || undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCustomersQueryKey() });
          setShowCreate(false);
          reset();
          toast({ title: "顧客已新增" });
        },
        onError: () => toast({ title: "新增顧客失敗", variant: "destructive" }),
      }
    );
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">顧客管理</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isLoading ? "載入中…" : `共 ${customers?.length ?? 0} 位顧客`}
          </p>
        </div>
        <Button data-testid="button-add-customer" onClick={() => setShowCreate(true)} size="sm" className="gap-1.5">
          <Plus className="h-4 w-4" /> 新增顧客
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          data-testid="input-search-customers"
          placeholder="依姓名或電話搜尋…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="bg-card border border-card-border rounded-xl overflow-hidden">
        <div className="flex items-center gap-4 px-5 py-2.5 bg-muted/40 border-b border-border">
          <div className="w-9 shrink-0" />
          <div className="flex-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">姓名</div>
          <div className="hidden sm:flex items-center gap-6 shrink-0 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span className="w-16 text-right">造訪次數</span>
            <span className="w-16 text-right">消費金額</span>
            <span className="w-12 text-right">點數</span>
          </div>
          <div className="w-4 shrink-0" />
        </div>

        {isLoading ? (
          <div className="divide-y divide-border">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3.5">
                <div className="w-9 h-9 rounded-full bg-muted animate-pulse" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 bg-muted animate-pulse rounded w-32" />
                  <div className="h-3 bg-muted animate-pulse rounded w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : customers && customers.length > 0 ? (
          customers.map((c) => <CustomerRow key={c.id} customer={c} />)
        ) : (
          <div className="py-16 text-center">
            <NoCustomersIcon className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium text-foreground">找不到顧客</p>
            <p className="text-xs text-muted-foreground mt-1">{search ? "請嘗試其他搜尋條件" : "新增第一位顧客以開始使用"}</p>
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新增顧客</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">姓名 *</label>
              <Input data-testid="input-customer-name" placeholder="顧客姓名" {...register("name", { required: true })} className={cn(errors.name && "border-destructive")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">電話 *</label>
              <Input data-testid="input-customer-phone" placeholder="555-0000" {...register("phone", { required: true })} className={cn(errors.phone && "border-destructive")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">電子郵件</label>
              <Input data-testid="input-customer-email" placeholder="email@example.com" type="email" {...register("email")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input data-testid="input-customer-notes" placeholder="飲食偏好、過敏資訊…" {...register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
              <Button data-testid="button-submit-customer" type="submit" disabled={createCustomer.isPending}>
                {createCustomer.isPending ? "新增中…" : "新增顧客"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NoCustomersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
