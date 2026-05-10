import {
  db,
  tablesTable,
  productsTable,
  customersTable,
  staffTable,
  ordersTable,
  orderItemsTable,
  reservationsTable,
  shiftsTable,
  tasksTable,
  visitsTable,
} from "@workspace/db";

async function clearAll() {
  await db.delete(visitsTable);
  await db.delete(tasksTable);
  await db.delete(shiftsTable);
  await db.delete(orderItemsTable);
  await db.delete(reservationsTable);
  await db.delete(ordersTable);
  await db.delete(staffTable);
  await db.delete(customersTable);
  await db.delete(productsTable);
  await db.delete(tablesTable);
}

async function seed() {
  console.log("🌱 Clearing existing data...");
  await clearAll();

  // ── Tables ──────────────────────────────────────────────────────────────
  console.log("🪑 Seeding tables...");
  const tables = await db
    .insert(tablesTable)
    .values([
      { number: 1, section: "窗邊", capacity: 2, status: "available" },
      { number: 2, section: "窗邊", capacity: 2, status: "occupied" },
      { number: 3, section: "窗邊", capacity: 4, status: "available" },
      { number: 4, section: "主廳", capacity: 4, status: "occupied" },
      { number: 5, section: "主廳", capacity: 4, status: "reserved" },
      { number: 6, section: "主廳", capacity: 6, status: "available" },
      { number: 7, section: "主廳", capacity: 6, status: "occupied" },
      { number: 8, section: "主廳", capacity: 8, status: "available" },
      { number: 9, section: "露台", capacity: 2, status: "available" },
      { number: 10, section: "露台", capacity: 4, status: "occupied" },
      { number: 11, section: "包廂", capacity: 8, status: "available" },
      { number: 12, section: "包廂", capacity: 10, status: "reserved" },
    ])
    .returning();

  // ── Products ─────────────────────────────────────────────────────────────
  console.log("🍜 Seeding products...");
  const products = await db
    .insert(productsTable)
    .values([
      { name: "鹽水雞", category: "Starter", price: 180, description: "嫩煮雞腿佐蒜泥薑絲，冷盤招牌", available: true },
      { name: "蒜泥白肉", category: "Starter", price: 220, description: "五花肉薄切，淋上蒜泥醬汁", available: true },
      { name: "涼拌海蜇皮", category: "Starter", price: 160, description: "新鮮海蜇皮拌芝麻油", available: true },
      { name: "皮蛋豆腐", category: "Starter", price: 140, description: "嫩豆腐搭配皮蛋與醬油膏", available: true },
      { name: "三杯雞", category: "Main", price: 320, description: "台式經典三杯料理，九層塔提香", available: true },
      { name: "滷肉飯", category: "Main", price: 120, description: "細火慢滷豬絞肉，醬汁濃郁", available: true },
      { name: "紅燒東坡肉", category: "Main", price: 380, description: "半肥半瘦五花肉紅燒四小時", available: true },
      { name: "宮保蝦仁", category: "Main", price: 380, description: "蝦仁炒花生、辣椒，微辣口感", available: true },
      { name: "清蒸鱸魚", category: "Main", price: 520, description: "鮮嫩鱸魚清蒸，附薑絲蔥絲", available: true },
      { name: "麻婆豆腐", category: "Main", price: 220, description: "川式豆腐料理，花椒麻辣風味", available: true },
      { name: "蔥爆牛肉", category: "Main", price: 350, description: "嫩煎牛肉大火爆炒青蔥", available: true },
      { name: "牛肉麵", category: "Main", price: 220, description: "自製麵條，紅燒牛腱心", available: true },
      { name: "擔擔麵", category: "Main", price: 180, description: "四川風味花生芝麻醬麵", available: true },
      { name: "珍珠奶茶", category: "Beverage", price: 80, description: "手搖珍珠奶茶，可調甜度", available: true },
      { name: "青茶（冷/熱）", category: "Beverage", price: 60, description: "當日新鮮泡製阿里山青茶", available: true },
      { name: "冬瓜茶", category: "Beverage", price: 50, description: "古法熬製冬瓜磚冬瓜茶", available: true },
      { name: "鮮榨柳橙汁", category: "Beverage", price: 90, description: "現榨100%新鮮柳橙，無加糖", available: true },
      { name: "湯圓", category: "Dessert", price: 100, description: "桂花蜜湯小湯圓，暖心甜品", available: true },
      { name: "芒果冰", category: "Dessert", price: 150, description: "台南愛文芒果刨冰，季節限定", available: true },
      { name: "豆花", category: "Dessert", price: 80, description: "手工嫩豆花，搭配黃豆漿", available: true },
    ])
    .returning();

  // ── Customers ─────────────────────────────────────────────────────────────
  console.log("👥 Seeding customers...");
  const customers = await db
    .insert(customersTable)
    .values([
      { name: "陳美玲", phone: "0912-345-678", email: "meiling.chen@email.com", loyaltyPoints: 1850, totalSpend: 18500, visitCount: 24, tags: ["VIP", "常客"], notes: "偏愛靠窗座位，過敏：堅果" },
      { name: "林志豪", phone: "0923-456-789", email: "jhlin@mail.com", loyaltyPoints: 1200, totalSpend: 12000, visitCount: 16, tags: ["VIP"], notes: "生日：6/15" },
      { name: "王小明", phone: "0934-567-890", email: null, loyaltyPoints: 580, totalSpend: 5800, visitCount: 8, tags: [], notes: null },
      { name: "李淑芬", phone: "0945-678-901", email: "shufen.li@gmail.com", loyaltyPoints: 430, totalSpend: 4300, visitCount: 6, tags: [], notes: "不吃辣" },
      { name: "張志明", phone: "0956-789-012", email: null, loyaltyPoints: 750, totalSpend: 7500, visitCount: 10, tags: [], notes: null },
      { name: "黃雅琪", phone: "0967-890-123", email: "yachi.huang@mail.com", loyaltyPoints: 320, totalSpend: 3200, visitCount: 4, tags: [], notes: "素食者" },
      { name: "劉文傑", phone: "0978-901-234", email: null, loyaltyPoints: 990, totalSpend: 9900, visitCount: 13, tags: ["常客"], notes: null },
      { name: "吳佩珊", phone: "0989-012-345", email: "peisan@email.com", loyaltyPoints: 160, totalSpend: 1600, visitCount: 2, tags: [], notes: null },
      { name: "蔡明哲", phone: "0900-123-456", email: null, loyaltyPoints: 640, totalSpend: 6400, visitCount: 9, tags: [], notes: "喜歡安靜包廂" },
      { name: "鄭雅文", phone: "0911-234-567", email: "yawen@gmail.com", loyaltyPoints: 270, totalSpend: 2700, visitCount: 3, tags: [], notes: null },
      { name: "許建國", phone: "0922-345-678", email: null, loyaltyPoints: 80, totalSpend: 800, visitCount: 1, tags: [], notes: null },
      { name: "彭淑慧", phone: "0933-456-789", email: "shuhui.peng@mail.com", loyaltyPoints: 120, totalSpend: 1200, visitCount: 2, tags: [], notes: null },
    ])
    .returning();

  // ── Staff ──────────────────────────────────────────────────────────────────
  console.log("👨‍🍳 Seeding staff...");
  const staff = await db
    .insert(staffTable)
    .values([
      { name: "王建仁", role: "manager", phone: "0912-001-001", email: "manager@restaurant.com", hireDate: "2022-03-01", status: "active" },
      { name: "林美華", role: "server", phone: "0912-002-002", email: "meihua@restaurant.com", hireDate: "2023-06-15", status: "active" },
      { name: "陳志豪", role: "server", phone: "0912-003-003", email: "zhihao@restaurant.com", hireDate: "2023-09-01", status: "active" },
      { name: "黃師傅", role: "chef", phone: "0912-004-004", email: "chef.huang@restaurant.com", hireDate: "2022-05-10", status: "active" },
      { name: "李廚師", role: "chef", phone: "0912-005-005", email: null, hireDate: "2024-01-20", status: "active" },
      { name: "吳小玲", role: "server", phone: "0912-006-006", email: "xiaoling@restaurant.com", hireDate: "2024-08-01", status: "active" },
      { name: "張大偉", role: "cashier", phone: "0912-007-007", email: null, hireDate: "2025-02-14", status: "active" },
    ])
    .returning();

  // ── Orders (past 30 days) ──────────────────────────────────────────────────
  console.log("📋 Seeding orders...");

  const now = new Date("2026-05-10T14:00:00");

  function daysAgo(d: number, h = 12, m = 0): Date {
    const dt = new Date(now);
    dt.setDate(dt.getDate() - d);
    dt.setHours(h, m, 0, 0);
    return dt;
  }

  const orderData = [
    // Today
    { customerId: customers[0].id, tableId: tables[1].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(0, 12, 15), items: [[0, 2], [5, 1], [14, 2], [17, 2]] },
    { customerId: customers[3].id, tableId: tables[3].id, type: "dine-in", status: "preparing", paymentStatus: "unpaid", createdAt: daysAgo(0, 13, 30), items: [[4, 1], [10, 1], [14, 1], [19, 1]] },
    { customerId: null, tableId: null, type: "takeout", status: "ready", paymentStatus: "paid", createdAt: daysAgo(0, 13, 45), items: [[6, 1], [15, 2], [18, 1]] },
    { customerId: customers[6].id, tableId: tables[6].id, type: "dine-in", status: "pending", paymentStatus: "unpaid", createdAt: daysAgo(0, 14, 0), items: [[8, 1], [11, 2], [13, 1]] },
    { customerId: customers[1].id, tableId: tables[9].id, type: "dine-in", status: "seated", paymentStatus: "unpaid", createdAt: daysAgo(0, 14, 5), items: [[4, 2], [7, 1], [14, 2], [19, 2]] },
    // Yesterday
    { customerId: customers[2].id, tableId: tables[2].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(1, 11, 20), items: [[5, 2], [12, 1], [15, 2]] },
    { customerId: customers[4].id, tableId: tables[4].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(1, 12, 0), items: [[4, 1], [9, 1], [16, 2]] },
    { customerId: null, tableId: null, type: "takeout", status: "completed", paymentStatus: "paid", createdAt: daysAgo(1, 13, 10), items: [[11, 1], [13, 1], [17, 2]] },
    { customerId: customers[0].id, tableId: tables[0].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(1, 19, 30), items: [[0, 1], [6, 1], [8, 1], [14, 1], [19, 1]] },
    { customerId: customers[8].id, tableId: tables[10].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(1, 20, 0), items: [[1, 2], [4, 2], [10, 1], [13, 3], [17, 2]] },
    // 3 days ago
    { customerId: customers[5].id, tableId: tables[5].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(3, 12, 30), items: [[2, 2], [9, 1], [15, 2], [18, 1]] },
    { customerId: customers[1].id, tableId: tables[7].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(3, 19, 0), items: [[8, 1], [7, 1], [0, 2], [13, 2], [19, 2]] },
    { customerId: null, tableId: null, type: "takeout", status: "completed", paymentStatus: "paid", createdAt: daysAgo(3, 14, 20), items: [[11, 2], [14, 1]] },
    // 5 days ago
    { customerId: customers[6].id, tableId: tables[3].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(5, 12, 0), items: [[4, 1], [10, 1], [5, 2], [14, 2]] },
    { customerId: customers[3].id, tableId: tables[1].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(5, 18, 30), items: [[6, 1], [8, 1], [16, 2], [19, 1]] },
    { customerId: customers[9].id, tableId: tables[8].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(5, 13, 10), items: [[11, 1], [12, 1], [15, 2]] },
    // 7 days ago
    { customerId: customers[0].id, tableId: tables[0].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(7, 19, 45), items: [[0, 2], [7, 1], [8, 1], [13, 2], [17, 2]] },
    { customerId: customers[4].id, tableId: tables[6].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(7, 12, 30), items: [[4, 2], [9, 1], [14, 2]] },
    { customerId: null, tableId: null, type: "takeout", status: "completed", paymentStatus: "paid", createdAt: daysAgo(7, 11, 0), items: [[11, 1], [16, 1]] },
    // 10 days ago
    { customerId: customers[2].id, tableId: tables[2].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(10, 13, 0), items: [[5, 3], [10, 1], [13, 2], [18, 1]] },
    { customerId: customers[8].id, tableId: tables[10].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(10, 19, 30), items: [[4, 2], [6, 1], [0, 2], [14, 3], [17, 2]] },
    { customerId: customers[11].id, tableId: tables[4].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(10, 12, 15), items: [[11, 1], [15, 2], [19, 1]] },
    // 14 days ago
    { customerId: customers[1].id, tableId: tables[11].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(14, 19, 0), items: [[8, 1], [7, 2], [1, 3], [4, 2], [13, 4], [17, 4]] },
    { customerId: customers[6].id, tableId: tables[5].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(14, 12, 0), items: [[4, 1], [9, 1], [10, 1], [14, 1]] },
    { customerId: null, tableId: null, type: "takeout", status: "cancelled", paymentStatus: "refunded", createdAt: daysAgo(14, 14, 30), items: [[11, 1], [13, 1]] },
    // 20 days ago
    { customerId: customers[5].id, tableId: tables[5].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(20, 12, 45), items: [[2, 2], [9, 1], [15, 3], [19, 1]] },
    { customerId: customers[0].id, tableId: tables[0].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(20, 20, 0), items: [[0, 1], [6, 1], [8, 1], [13, 1], [19, 1]] },
    { customerId: customers[10].id, tableId: tables[2].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(20, 13, 20), items: [[5, 1], [11, 1], [14, 2]] },
    // 25 days ago
    { customerId: customers[4].id, tableId: tables[4].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(25, 18, 30), items: [[4, 2], [7, 1], [8, 1], [13, 2]] },
    { customerId: customers[7].id, tableId: tables[3].id, type: "dine-in", status: "completed", paymentStatus: "paid", createdAt: daysAgo(25, 12, 10), items: [[11, 1], [16, 2], [18, 1]] },
    { customerId: null, tableId: null, type: "takeout", status: "completed", paymentStatus: "paid", createdAt: daysAgo(25, 13, 5), items: [[5, 2], [14, 1]] },
  ];

  for (const o of orderData) {
    const totalAmount = o.items.reduce((sum, [pi, qty]) => sum + products[pi].price * qty, 0);

    const [order] = await db
      .insert(ordersTable)
      .values({
        customerId: o.customerId ?? undefined,
        tableId: o.tableId ?? undefined,
        type: o.type,
        status: o.status,
        paymentStatus: o.paymentStatus,
        totalAmount,
        notes: null,
        createdAt: o.createdAt,
      })
      .returning();

    await db.insert(orderItemsTable).values(
      o.items.map(([pi, qty]) => ({
        orderId: order.id,
        productId: products[pi].id,
        productName: products[pi].name,
        quantity: qty,
        unitPrice: products[pi].price,
        subtotal: products[pi].price * qty,
      }))
    );
  }

  // ── Reservations ──────────────────────────────────────────────────────────
  console.log("📅 Seeding reservations...");

  function resAt(daysFromNow: number, h: number, m = 0): Date {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + daysFromNow);
    dt.setHours(h, m, 0, 0);
    return dt;
  }

  await db.insert(reservationsTable).values([
    { customerName: "陳美玲", customerPhone: "0912-345-678", partySize: 2, reservedAt: resAt(0, 18, 30), tableId: tables[0].id, status: "confirmed", notes: "靠窗座位" },
    { customerName: "林志豪", customerPhone: "0923-456-789", partySize: 4, reservedAt: resAt(0, 19, 0), tableId: tables[4].id, status: "confirmed", notes: "生日慶祝，請備蠟燭" },
    { customerName: "張志明", customerPhone: "0956-789-012", partySize: 6, reservedAt: resAt(0, 19, 30), tableId: tables[5].id, status: "pending", notes: null },
    { customerName: "蔡明哲", customerPhone: "0900-123-456", partySize: 8, reservedAt: resAt(0, 20, 0), tableId: tables[10].id, status: "confirmed", notes: "包廂，商務晚宴" },
    { customerName: "黃雅琪", customerPhone: "0967-890-123", partySize: 2, reservedAt: resAt(1, 12, 0), tableId: tables[8].id, status: "confirmed", notes: "素食友善" },
    { customerName: "劉文傑", customerPhone: "0978-901-234", partySize: 3, reservedAt: resAt(1, 19, 0), tableId: tables[2].id, status: "pending", notes: null },
    { customerName: "王小明", customerPhone: "0934-567-890", partySize: 2, reservedAt: resAt(2, 12, 30), tableId: tables[1].id, status: "confirmed", notes: null },
    { customerName: "鄭雅文", customerPhone: "0911-234-567", partySize: 5, reservedAt: resAt(2, 19, 30), tableId: tables[6].id, status: "confirmed", notes: "不吃海鮮" },
    { customerName: "許建國", customerPhone: "0922-345-678", partySize: 10, reservedAt: resAt(3, 18, 0), tableId: tables[11].id, status: "pending", notes: "家庭聚餐" },
    { customerName: "彭淑慧", customerPhone: "0933-456-789", partySize: 2, reservedAt: resAt(4, 12, 0), tableId: tables[0].id, status: "confirmed", notes: null },
    { customerName: "吳佩珊", customerPhone: "0989-012-345", partySize: 4, reservedAt: resAt(5, 19, 0), tableId: tables[3].id, status: "confirmed", notes: null },
  ]);

  // ── Shifts ────────────────────────────────────────────────────────────────
  console.log("🕐 Seeding shifts...");

  function shiftDate(daysFromNow: number) {
    const dt = new Date(now);
    dt.setDate(dt.getDate() + daysFromNow);
    return dt.toISOString().split("T")[0];
  }

  const shiftData = [];
  for (let d = -3; d <= 4; d++) {
    const date = shiftDate(d);
    shiftData.push(
      { staffId: staff[0].id, date, startTime: "10:00", endTime: "22:00", role: "manager", notes: null },
      { staffId: staff[1].id, date, startTime: "10:00", endTime: "16:00", role: "server", notes: null },
      { staffId: staff[2].id, date, startTime: "16:00", endTime: "22:00", role: "server", notes: null },
      { staffId: staff[3].id, date, startTime: "09:00", endTime: "17:00", role: "chef", notes: null },
      { staffId: staff[4].id, date, startTime: "15:00", endTime: "22:00", role: "chef", notes: null },
    );
    if (d % 2 === 0) {
      shiftData.push({ staffId: staff[5].id, date, startTime: "11:00", endTime: "19:00", role: "server", notes: null });
    }
    if (d % 3 !== 0) {
      shiftData.push({ staffId: staff[6].id, date, startTime: "10:00", endTime: "18:00", role: "cashier", notes: null });
    }
  }
  await db.insert(shiftsTable).values(shiftData);

  // ── Tasks ─────────────────────────────────────────────────────────────────
  console.log("✅ Seeding tasks...");

  await db.insert(tasksTable).values([
    { title: "補充廚房耗材庫存", description: "花生油、醬油、五香粉需補貨", priority: "high", status: "todo", staffId: staff[3].id, dueDate: shiftDate(1) },
    { title: "整理訂位系統資料", description: "清理上個月已完成的訂位紀錄", priority: "medium", status: "in-progress", staffId: staff[0].id, dueDate: shiftDate(2) },
    { title: "員工月度績效評核", description: "本月績效表單填寫與回饋", priority: "high", status: "todo", staffId: staff[0].id, dueDate: shiftDate(5) },
    { title: "清潔露台區域", description: "週末前需完成露台深度清潔", priority: "medium", status: "todo", staffId: staff[5].id, dueDate: shiftDate(3) },
    { title: "更新菜單定價", description: "季節性食材漲價，需調整部分品項售價", priority: "low", status: "in-progress", staffId: staff[0].id, dueDate: shiftDate(7) },
    { title: "訓練新進收銀員", description: "POS系統操作與點餐流程培訓", priority: "medium", status: "done", staffId: staff[6].id, dueDate: shiftDate(-1) },
    { title: "檢查冷藏設備溫度", description: "每日例行設備檢查，並記錄溫度", priority: "high", status: "done", staffId: staff[3].id, dueDate: shiftDate(0) },
  ]);

  // ── Visits ────────────────────────────────────────────────────────────────
  console.log("🏃 Seeding visits...");

  const visitData = [
    { customerId: customers[0].id, visitedAt: daysAgo(0, 12, 15), amount: 740 },
    { customerId: customers[0].id, visitedAt: daysAgo(1, 19, 30), amount: 1240 },
    { customerId: customers[0].id, visitedAt: daysAgo(7, 19, 45), amount: 960 },
    { customerId: customers[0].id, visitedAt: daysAgo(20, 20, 0), amount: 800 },
    { customerId: customers[1].id, visitedAt: daysAgo(0, 14, 5), amount: 1280 },
    { customerId: customers[1].id, visitedAt: daysAgo(3, 19, 0), amount: 1580 },
    { customerId: customers[1].id, visitedAt: daysAgo(14, 19, 0), amount: 2380 },
    { customerId: customers[2].id, visitedAt: daysAgo(1, 11, 20), amount: 490 },
    { customerId: customers[2].id, visitedAt: daysAgo(10, 13, 0), amount: 680 },
    { customerId: customers[3].id, visitedAt: daysAgo(0, 13, 30), amount: 650 },
    { customerId: customers[3].id, visitedAt: daysAgo(5, 18, 30), amount: 900 },
    { customerId: customers[4].id, visitedAt: daysAgo(1, 12, 0), amount: 560 },
    { customerId: customers[4].id, visitedAt: daysAgo(7, 12, 30), amount: 700 },
    { customerId: customers[4].id, visitedAt: daysAgo(25, 18, 30), amount: 1060 },
    { customerId: customers[5].id, visitedAt: daysAgo(3, 12, 30), amount: 500 },
    { customerId: customers[5].id, visitedAt: daysAgo(20, 12, 45), amount: 570 },
    { customerId: customers[6].id, visitedAt: daysAgo(0, 14, 0), amount: 750 },
    { customerId: customers[6].id, visitedAt: daysAgo(5, 12, 0), amount: 760 },
    { customerId: customers[6].id, visitedAt: daysAgo(14, 12, 0), amount: 680 },
    { customerId: customers[7].id, visitedAt: daysAgo(25, 12, 10), amount: 450 },
    { customerId: customers[8].id, visitedAt: daysAgo(1, 20, 0), amount: 1240 },
    { customerId: customers[8].id, visitedAt: daysAgo(10, 19, 30), amount: 1560 },
    { customerId: customers[9].id, visitedAt: daysAgo(5, 13, 10), amount: 580 },
    { customerId: customers[10].id, visitedAt: daysAgo(20, 13, 20), amount: 480 },
    { customerId: customers[11].id, visitedAt: daysAgo(10, 12, 15), amount: 380 },
    { customerId: customers[11].id, visitedAt: daysAgo(25, 12, 10), amount: 540 },
  ];

  await db.insert(visitsTable).values(visitData);

  console.log("✨ Seed complete!");
  console.log(`  ${tables.length} tables`);
  console.log(`  ${products.length} products`);
  console.log(`  ${customers.length} customers`);
  console.log(`  ${staff.length} staff`);
  console.log(`  ${orderData.length} orders`);
  console.log(`  11 reservations`);
  console.log(`  ${shiftData.length} shifts`);
  console.log(`  7 tasks`);
  console.log(`  ${visitData.length} visits`);

  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
