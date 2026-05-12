import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, staffTable, shiftsTable, tasksTable } from "@workspace/db";
import {
  ListStaffQueryParams,
  CreateStaffBody,
  UpdateStaffParams,
  UpdateStaffBody,
  DeleteStaffParams,
  ListShiftsQueryParams,
  CreateShiftBody,
  UpdateShiftParams,
  UpdateShiftBody,
  DeleteShiftParams,
  ListTasksQueryParams,
  CreateTaskBody,
  UpdateTaskParams,
  UpdateTaskBody,
  DeleteTaskParams,
} from "@workspace/api-zod";
import { and } from "drizzle-orm";

const router: IRouter = Router();

router.get("/staff", async (req, res): Promise<void> => {
  const parsed = ListStaffQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { role } = parsed.data;
  const staff = role
    ? await db.select().from(staffTable).where(eq(staffTable.role, role)).orderBy(staffTable.name)
    : await db.select().from(staffTable).orderBy(staffTable.name);
  res.json(staff);
});

router.post("/staff", async (req, res): Promise<void> => {
  const parsed = CreateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { name, role, phone, hireDate } = parsed.data;
  if (!name || !role || !phone || !hireDate) {
    res.status(400).json({ error: "name, role, phone, and hireDate are required" });
    return;
  }
  const data: typeof staffTable.$inferInsert = {
    name,
    role,
    phone,
    hireDate,
    email: parsed.data.email,
    notes: parsed.data.notes,
  };
  const [member] = await db.insert(staffTable).values(data).returning();
  res.status(201).json(member);
});

router.patch("/staff/:id", async (req, res): Promise<void> => {
  const params = UpdateStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStaffBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [member] = await db.update(staffTable).set(parsed.data).where(eq(staffTable.id, params.data.id)).returning();
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.json(member);
});

router.delete("/staff/:id", async (req, res): Promise<void> => {
  const params = DeleteStaffParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [member] = await db.delete(staffTable).where(eq(staffTable.id, params.data.id)).returning();
  if (!member) {
    res.status(404).json({ error: "Staff member not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/shifts", async (req, res): Promise<void> => {
  const parsed = ListShiftsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { date, staffId } = parsed.data;
  const conditions = [];
  if (date) conditions.push(eq(shiftsTable.date, date));
  if (staffId) conditions.push(eq(shiftsTable.staffId, staffId));
  const rawShifts = conditions.length > 0
    ? await db.select().from(shiftsTable).where(and(...conditions)).orderBy(shiftsTable.date, shiftsTable.startTime)
    : await db.select().from(shiftsTable).orderBy(shiftsTable.date, shiftsTable.startTime);
  const staff = await db.select().from(staffTable);
  const staffMap = new Map(staff.map(s => [s.id, s.name]));
  const shifts = rawShifts.map(s => ({ ...s, staffName: staffMap.get(s.staffId) ?? "Unknown" }));
  res.json(shifts);
});

router.post("/shifts", async (req, res): Promise<void> => {
  const parsed = CreateShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { staffId, date, startTime, endTime, role } = parsed.data;
  if (typeof staffId !== "number" || !date || !startTime || !endTime || !role) {
    res.status(400).json({ error: "staffId, date, startTime, endTime, and role are required" });
    return;
  }
  const data: typeof shiftsTable.$inferInsert = {
    staffId,
    date,
    startTime,
    endTime,
    role,
    notes: parsed.data.notes,
  };
  const [shift] = await db.insert(shiftsTable).values(data).returning();
  const [staffMember] = await db.select().from(staffTable).where(eq(staffTable.id, shift.staffId));
  res.status(201).json({ ...shift, staffName: staffMember?.name ?? "Unknown" });
});

router.patch("/shifts/:id", async (req, res): Promise<void> => {
  const params = UpdateShiftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateShiftBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [shift] = await db.update(shiftsTable).set(parsed.data).where(eq(shiftsTable.id, params.data.id)).returning();
  if (!shift) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  const [staffMember] = await db.select().from(staffTable).where(eq(staffTable.id, shift.staffId));
  res.json({ ...shift, staffName: staffMember?.name ?? "Unknown" });
});

router.delete("/shifts/:id", async (req, res): Promise<void> => {
  const params = DeleteShiftParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [shift] = await db.delete(shiftsTable).where(eq(shiftsTable.id, params.data.id)).returning();
  if (!shift) {
    res.status(404).json({ error: "Shift not found" });
    return;
  }
  res.sendStatus(204);
});

router.get("/tasks", async (req, res): Promise<void> => {
  const parsed = ListTasksQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { staffId, status } = parsed.data;
  const conditions = [];
  if (staffId) conditions.push(eq(tasksTable.staffId, staffId));
  if (status) conditions.push(eq(tasksTable.status, status));
  const rawTasks = conditions.length > 0
    ? await db.select().from(tasksTable).where(and(...conditions)).orderBy(tasksTable.createdAt)
    : await db.select().from(tasksTable).orderBy(tasksTable.createdAt);
  const staff = await db.select().from(staffTable);
  const staffMap = new Map(staff.map(s => [s.id, s.name]));
  const tasks = rawTasks.map(t => ({ ...t, staffName: t.staffId ? (staffMap.get(t.staffId) ?? null) : null }));
  res.json(tasks);
});

router.post("/tasks", async (req, res): Promise<void> => {
  const parsed = CreateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { title, priority } = parsed.data;
  if (!title || !priority) {
    res.status(400).json({ error: "title and priority are required" });
    return;
  }
  const data: typeof tasksTable.$inferInsert = {
    staffId: parsed.data.staffId,
    title,
    description: parsed.data.description,
    priority,
    dueDate: parsed.data.dueDate,
  };
  const [task] = await db.insert(tasksTable).values(data).returning();
  let staffName = null;
  if (task.staffId) {
    const [staffMember] = await db.select().from(staffTable).where(eq(staffTable.id, task.staffId));
    staffName = staffMember?.name ?? null;
  }
  res.status(201).json({ ...task, staffName });
});

router.patch("/tasks/:id", async (req, res): Promise<void> => {
  const params = UpdateTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateTaskBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [task] = await db.update(tasksTable).set(parsed.data).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  let staffName = null;
  if (task.staffId) {
    const [staffMember] = await db.select().from(staffTable).where(eq(staffTable.id, task.staffId));
    staffName = staffMember?.name ?? null;
  }
  res.json({ ...task, staffName });
});

router.delete("/tasks/:id", async (req, res): Promise<void> => {
  const params = DeleteTaskParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [task] = await db.delete(tasksTable).where(eq(tasksTable.id, params.data.id)).returning();
  if (!task) {
    res.status(404).json({ error: "Task not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
