import { useParams, useLocation } from "wouter";
import {
  useGetCustomer,
  useListCustomerVisits,
  useUpdateCustomer,
  useAddLoyaltyPoints,
  getGetCustomerQueryKey,
  getListCustomerVisitsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Star, Phone, Mail, Edit2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { cn } from "@/lib/utils";

interface EditForm { name: string; phone: string; email: string; notes: string; }
interface PointsForm { points: number; reason: string; }

const ORDER_TYPE_LABELS: Record<string, string> = {
  "dine-in": "內用",
  takeout: "外帶",
};

export default function CustomerProfile() {
  const { id } = useParams<{ id: string }>();
  const customerId = parseInt(id, 10);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);
  const [showPoints, setShowPoints] = useState(false);

  const { data: customer, isLoading } = useGetCustomer(customerId, {
    query: { enabled: !!customerId, queryKey: getGetCustomerQueryKey(customerId) },
  });
  const { data: visits, isLoading: visitsLoading } = useListCustomerVisits(customerId, {
    query: { enabled: !!customerId, queryKey: getListCustomerVisitsQueryKey(customerId) },
  });

  const updateCustomer = useUpdateCustomer();
  const addPoints = useAddLoyaltyPoints();

  const editForm = useForm<EditForm>();
  const pointsForm = useForm<PointsForm>();

  const onEdit = (data: EditForm) => {
    updateCustomer.mutate(
      { id: customerId, data: { name: data.name, phone: data.phone, email: data.email || undefined, notes: data.notes || undefined } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
          setShowEdit(false);
          toast({ title: "顧客資料已更新" });
        },
        onError: () => toast({ title: "更新失敗", variant: "destructive" }),
      }
    );
  };

  const onAddPoints = (data: PointsForm) => {
    addPoints.mutate(
      { id: customerId, data: { points: Number(data.points), reason: data.reason } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCustomerQueryKey(customerId) });
          setShowPoints(false);
          pointsForm.reset();
          toast({ title: `已新增 ${data.points} 點` });
        },
        onError: () => toast({ title: "新增點數失敗", variant: "destructive" }),
      }
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <div className="h-8 bg-muted animate-pulse rounded w-32" />
        <div className="h-40 bg-muted animate-pulse rounded-xl" />
        <div className="h-64 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!customer) return (
    <div className="p-6 text-center">
      <p className="text-muted-foreground">找不到此顧客。</p>
      <Button variant="link" onClick={() => setLocation("/customers")}>返回顧客列表</Button>
    </div>
  );

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/customers")} className="gap-1.5 -ml-2">
          <ArrowLeft className="h-4 w-4" /> 返回
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPoints(true)} className="gap-1.5">
            <Star className="h-3.5 w-3.5" /> 新增點數
          </Button>
          <Button size="sm" onClick={() => { editForm.reset({ name: customer.name, phone: customer.phone, email: customer.email ?? "", notes: customer.notes ?? "" }); setShowEdit(true); }} className="gap-1.5">
            <Edit2 className="h-3.5 w-3.5" /> 編輯
          </Button>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <span className="text-2xl font-bold text-primary">{customer.name.charAt(0)}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-foreground">{customer.name}</h1>
              {customer.tags.map(tag => (
                <Badge key={tag} variant="secondary" className={cn("text-xs", tag === "VIP" && "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0")}>
                  {tag}
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-4 mt-2">
              <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{customer.phone}</span>
              {customer.email && <span className="text-sm text-muted-foreground flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{customer.email}</span>}
            </div>
            {customer.notes && <p className="text-sm text-muted-foreground mt-2 italic">「{customer.notes}」</p>}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-6 pt-5 border-t border-border">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">總造訪次數</p>
            <p className="text-2xl font-bold text-foreground mt-1">{customer.visitCount}</p>
          </div>
          <div className="text-center border-x border-border">
            <p className="text-xs text-muted-foreground">總消費金額</p>
            <p className="text-2xl font-bold text-foreground mt-1">${customer.totalSpend.toFixed(0)}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-amber-500">
              <Star className="h-4 w-4 fill-current" />
              <p className="text-xs text-muted-foreground text-amber-600 dark:text-amber-400">累積點數</p>
            </div>
            <p className="text-2xl font-bold text-foreground mt-1">{customer.loyaltyPoints}</p>
          </div>
        </div>
      </div>

      <div className="bg-card border border-card-border rounded-xl p-5">
        <h2 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-muted-foreground" /> 造訪紀錄
        </h2>
        {visitsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-muted animate-pulse rounded" />)}</div>
        ) : visits && visits.length > 0 ? (
          <div className="divide-y divide-border">
            {visits.map(visit => (
              <div key={visit.id} data-testid={`visit-${visit.id}`} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{ORDER_TYPE_LABELS[visit.orderType] ?? visit.orderType}訂單</p>
                  <p className="text-xs text-muted-foreground">{new Date(visit.visitedAt).toLocaleDateString("zh-TW", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className="text-sm font-semibold text-foreground">${visit.amount.toFixed(2)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-6 text-center">尚無造訪紀錄</p>
        )}
      </div>

      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader><DialogTitle>編輯顧客資料</DialogTitle></DialogHeader>
          <form onSubmit={editForm.handleSubmit(onEdit)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">姓名</label>
              <Input data-testid="input-edit-name" {...editForm.register("name", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">電話</label>
              <Input data-testid="input-edit-phone" {...editForm.register("phone", { required: true })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">電子郵件</label>
              <Input data-testid="input-edit-email" type="email" {...editForm.register("email")} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">備註</label>
              <Input data-testid="input-edit-notes" {...editForm.register("notes")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowEdit(false)}>取消</Button>
              <Button data-testid="button-save-customer" type="submit" disabled={updateCustomer.isPending}>儲存</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showPoints} onOpenChange={setShowPoints}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增累積點數</DialogTitle></DialogHeader>
          <form onSubmit={pointsForm.handleSubmit(onAddPoints)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">新增點數</label>
              <Input data-testid="input-points" type="number" placeholder="50" {...pointsForm.register("points", { required: true, min: 1 })} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">原因</label>
              <Input data-testid="input-points-reason" placeholder="生日優惠、特殊活動…" {...pointsForm.register("reason")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPoints(false)}>取消</Button>
              <Button data-testid="button-submit-points" type="submit" disabled={addPoints.isPending}>新增點數</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
