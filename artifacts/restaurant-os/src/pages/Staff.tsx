import { useState } from "react";
import {
  useListStaff,
  useListShifts,
  useListTasks,
  useCreateStaff,
  useDeleteStaff,
  useCreateShift,
  useDeleteShift,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
  getListStaffQueryKey,
  getListShiftsQueryKey,
  getListTasksQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, UserCog, Calendar, CheckSquare, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useForm, Controller } from "react-hook-form";
import { cn } from "@/lib/utils";

const ROLE_LABELS: Record<string, string> = {
  manager: "店長",
  chef: "廚師",
  server: "服務生",
  barista: "咖啡師",
  cashier: "收銀員",
  cleaner: "清潔員",
};

const ROLE_COLORS: Record<string, string> = {
  manager: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
  chef: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  server: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  barista: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  cashier: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  cleaner: "bg-muted text-muted-foreground",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "高",
  medium: "中",
  low: "低",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  low: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "待辦",
  "in-progress": "進行中",
  done: "已完成",
};

const TASK_STATUS_COLORS: Record<string, string> = {
  todo: "bg-muted text-muted-foreground",
  "in-progress": "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  done: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
};

interface StaffForm { name: string; role: string; phone: string; email: string; hireDate: string; }
interface ShiftForm { staffId: string; date: string; startTime: string; endTime: string; role: string; }
interface TaskForm { staffId: string; title: string; description: string; priority: string; dueDate: string; }

export default function Staff() {
  const [showStaffForm, setShowStaffForm] = useState(false);
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const today = new Date().toISOString().split("T")[0];

  const { data: staff, isLoading: staffLoading } = useListStaff();
  const { data: shifts, isLoading: shiftsLoading } = useListShifts({ date: today });
  const { data: tasks, isLoading: tasksLoading } = useListTasks();

  const createStaff = useCreateStaff();
  const deleteStaff = useDeleteStaff();
  const createShift = useCreateShift();
  const deleteShift = useDeleteShift();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const staffForm = useForm<StaffForm>({ defaultValues: { role: "server" } });
  const shiftForm = useForm<ShiftForm>({ defaultValues: { date: today, startTime: "09:00", endTime: "17:00", role: "server" } });
  const taskForm = useForm<TaskForm>({ defaultValues: { priority: "medium", staffId: "__none__" } });

  const onAddStaff = (data: StaffForm) => {
    createStaff.mutate(
      { data: { name: data.name, role: data.role, phone: data.phone, email: data.email || undefined, hireDate: data.hireDate } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() }); setShowStaffForm(false); staffForm.reset(); toast({ title: "員工已新增" }); },
        onError: () => toast({ title: "新增員工失敗", variant: "destructive" }),
      }
    );
  };

  const onDeleteStaff = (id: number) => {
    deleteStaff.mutate({ id }, {
      onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListStaffQueryKey() }); toast({ title: "員工已刪除" }); },
      onError: () => toast({ title: "刪除失敗", variant: "destructive" }),
    });
  };

  const onAddShift = (data: ShiftForm) => {
    createShift.mutate(
      { data: { staffId: Number(data.staffId), date: data.date, startTime: data.startTime, endTime: data.endTime, role: data.role } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() }); setShowShiftForm(false); shiftForm.reset(); toast({ title: "班次已排定" }); },
        onError: () => toast({ title: "排班失敗", variant: "destructive" }),
      }
    );
  };

  const onAddTask = (data: TaskForm) => {
    createTask.mutate(
      { data: { staffId: (data.staffId && data.staffId !== "__none__") ? Number(data.staffId) : undefined, title: data.title, description: data.description || undefined, priority: data.priority, dueDate: data.dueDate || undefined } },
      {
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }); setShowTaskForm(false); taskForm.reset(); toast({ title: "任務已建立" }); },
        onError: () => toast({ title: "建立任務失敗", variant: "destructive" }),
      }
    );
  };

  const cycleTaskStatus = (id: number, current: string) => {
    const statuses = ["todo", "in-progress", "done"];
    const next = statuses[(statuses.indexOf(current) + 1) % statuses.length];
    updateTask.mutate({ id, data: { status: next } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }),
    });
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-foreground">員工管理</h1>
        <p className="text-sm text-muted-foreground mt-0.5">團隊管理、班表與任務</p>
      </div>

      <Tabs defaultValue="team">
        <TabsList className="w-full max-w-sm">
          <TabsTrigger value="team" className="flex-1 gap-1.5"><UserCog className="h-3.5 w-3.5" />團隊</TabsTrigger>
          <TabsTrigger value="shifts" className="flex-1 gap-1.5"><Calendar className="h-3.5 w-3.5" />班表</TabsTrigger>
          <TabsTrigger value="tasks" className="flex-1 gap-1.5"><CheckSquare className="h-3.5 w-3.5" />任務</TabsTrigger>
        </TabsList>

        <TabsContent value="team" className="mt-5 space-y-4">
          <div className="flex justify-end">
            <Button data-testid="button-add-staff" onClick={() => setShowStaffForm(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增員工
            </Button>
          </div>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {staffLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 animate-pulse bg-muted/20 m-2 rounded" />)}
              </div>
            ) : staff && staff.length > 0 ? (
              <div className="divide-y divide-border">
                {staff.map(s => (
                  <div key={s.id} data-testid={`staff-${s.id}`} className="flex items-center gap-4 px-5 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-primary">{s.name.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground">{s.name}</p>
                        <Badge className={cn("text-[10px] border-0", ROLE_COLORS[s.role] ?? "bg-muted text-muted-foreground")}>
                          {ROLE_LABELS[s.role] ?? s.role}
                        </Badge>
                        {s.status === "inactive" && <Badge variant="secondary" className="text-[10px]">停職</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.phone}{s.email ? ` · ${s.email}` : ""}</p>
                    </div>
                    <div className="text-right hidden sm:block shrink-0">
                      <p className="text-xs text-muted-foreground">
                        到職：{new Date(s.hireDate).toLocaleDateString("zh-TW", { month: "short", year: "numeric" })}
                      </p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0" onClick={() => onDeleteStaff(s.id)} data-testid={`button-delete-staff-${s.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">尚無員工資料</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="shifts" className="mt-5 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">今日班表 — {today}</p>
            <Button data-testid="button-add-shift" onClick={() => setShowShiftForm(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增排班
            </Button>
          </div>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {shiftsLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted/20 m-2 rounded" />)}
              </div>
            ) : shifts && shifts.length > 0 ? (
              <div className="divide-y divide-border">
                {shifts.map(shift => (
                  <div key={shift.id} data-testid={`shift-${shift.id}`} className="flex items-center gap-4 px-5 py-3.5">
                    <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-foreground">{shift.staffName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">{shift.startTime} – {shift.endTime}</span>
                        <Badge className={cn("text-[10px] border-0", ROLE_COLORS[shift.role] ?? "bg-muted text-muted-foreground")}>
                          {ROLE_LABELS[shift.role] ?? shift.role}
                        </Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteShift.mutate({ id: shift.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListShiftsQueryKey() }) })}
                      data-testid={`button-delete-shift-${shift.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">今日尚無排班</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="tasks" className="mt-5 space-y-4">
          <div className="flex justify-end">
            <Button data-testid="button-add-task" onClick={() => setShowTaskForm(true)} size="sm" className="gap-1.5">
              <Plus className="h-4 w-4" /> 新增任務
            </Button>
          </div>
          <div className="bg-card border border-card-border rounded-xl overflow-hidden">
            {tasksLoading ? (
              <div className="divide-y divide-border">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-14 animate-pulse bg-muted/20 m-2 rounded" />)}
              </div>
            ) : tasks && tasks.length > 0 ? (
              <div className="divide-y divide-border">
                {tasks.map(task => (
                  <div key={task.id} data-testid={`task-${task.id}`} className="flex items-center gap-4 px-5 py-3.5">
                    <button onClick={() => cycleTaskStatus(task.id, task.status)} data-testid={`button-cycle-task-${task.id}`} className="shrink-0">
                      <div className={cn("w-5 h-5 rounded border-2 flex items-center justify-center transition-colors",
                        task.status === "done" ? "bg-green-500 border-green-500" :
                        task.status === "in-progress" ? "border-blue-500" : "border-border")}>
                        {task.status === "done" && <span className="text-white text-[10px]">✓</span>}
                        {task.status === "in-progress" && <span className="text-blue-500 text-[10px]">◐</span>}
                      </div>
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={cn("text-sm font-medium", task.status === "done" && "line-through text-muted-foreground")}>{task.title}</p>
                        <Badge className={cn("text-[10px] border-0", PRIORITY_COLORS[task.priority])}>
                          {PRIORITY_LABELS[task.priority] ?? task.priority}
                        </Badge>
                        <Badge className={cn("text-[10px] border-0", TASK_STATUS_COLORS[task.status])}>
                          {TASK_STATUS_LABELS[task.status] ?? task.status}
                        </Badge>
                      </div>
                      {(task.staffName || task.dueDate) && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {task.staffName && `指派給 ${task.staffName}`}{task.staffName && task.dueDate && " · "}{task.dueDate && `截止 ${task.dueDate}`}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteTask.mutate({ id: task.id }, { onSuccess: () => queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() }) })}
                      data-testid={`button-delete-task-${task.id}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground py-12 text-center">尚無任務</p>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={showStaffForm} onOpenChange={setShowStaffForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增員工</DialogTitle></DialogHeader>
          <form onSubmit={staffForm.handleSubmit(onAddStaff)} className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">姓名 *</label>
                <Input data-testid="input-staff-name" {...staffForm.register("name", { required: true })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">職位 *</label>
                <Controller control={staffForm.control} name="role" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(ROLE_LABELS).map(([val, label]) => (
                        <SelectItem key={val} value={val}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">電話 *</label>
                <Input data-testid="input-staff-phone" {...staffForm.register("phone", { required: true })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">到職日期 *</label>
                <Input data-testid="input-staff-hiredate" type="date" {...staffForm.register("hireDate", { required: true })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">電子郵件</label>
              <Input data-testid="input-staff-email" type="email" {...staffForm.register("email")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowStaffForm(false)}>取消</Button>
              <Button data-testid="button-submit-staff" type="submit" disabled={createStaff.isPending}>新增員工</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showShiftForm} onOpenChange={setShowShiftForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增排班</DialogTitle></DialogHeader>
          <form onSubmit={shiftForm.handleSubmit(onAddShift)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">員工 *</label>
              <Controller control={shiftForm.control} name="staffId" rules={{ required: true }} render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger data-testid="select-shift-staff"><SelectValue placeholder="選擇員工" /></SelectTrigger>
                  <SelectContent>
                    {(staff ?? []).filter(s => s.status === "active").map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}（{ROLE_LABELS[s.role] ?? s.role}）</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">日期 *</label>
                <Input data-testid="input-shift-date" type="date" {...shiftForm.register("date", { required: true })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">開始 *</label>
                <Input data-testid="input-shift-start" type="time" {...shiftForm.register("startTime", { required: true })} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">結束 *</label>
                <Input data-testid="input-shift-end" type="time" {...shiftForm.register("endTime", { required: true })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">班次職位</label>
              <Controller control={shiftForm.control} name="role" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowShiftForm(false)}>取消</Button>
              <Button data-testid="button-submit-shift" type="submit" disabled={createShift.isPending}>確認排班</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新增任務</DialogTitle></DialogHeader>
          <form onSubmit={taskForm.handleSubmit(onAddTask)} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">任務名稱 *</label>
              <Input data-testid="input-task-title" {...taskForm.register("title", { required: true })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">優先度</label>
                <Controller control={taskForm.control} name="priority" render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">高</SelectItem>
                      <SelectItem value="medium">中</SelectItem>
                      <SelectItem value="low">低</SelectItem>
                    </SelectContent>
                  </Select>
                )} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">截止日期</label>
                <Input data-testid="input-task-due" type="date" {...taskForm.register("dueDate")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">指派給</label>
              <Controller control={taskForm.control} name="staffId" render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger data-testid="select-task-staff"><SelectValue placeholder="未指派" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">未指派</SelectItem>
                    {(staff ?? []).filter(s => s.status === "active").map(s => (
                      <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">說明</label>
              <Input data-testid="input-task-desc" {...taskForm.register("description")} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowTaskForm(false)}>取消</Button>
              <Button data-testid="button-submit-task" type="submit" disabled={createTask.isPending}>建立任務</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
