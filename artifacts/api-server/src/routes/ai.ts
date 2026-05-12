import { Router, type IRouter } from "express";
import { db, ordersTable, orderItemsTable, customersTable } from "@workspace/db";
import { gte, sql, desc } from "drizzle-orm";
import { openai } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.post("/ai/insights", async (req, res): Promise<void> => {
  const logger = (req as any).log ?? console;

  try {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [recentOrders, topProducts, customerStats] = await Promise.all([
      db.select({
        id: ordersTable.id,
        status: ordersTable.status,
        type: ordersTable.type,
        totalAmount: ordersTable.totalAmount,
        paymentStatus: ordersTable.paymentStatus,
        createdAt: ordersTable.createdAt,
      })
        .from(ordersTable)
        .where(gte(ordersTable.createdAt, thirtyDaysAgo))
        .orderBy(desc(ordersTable.createdAt))
        .limit(100),

      db.select({
        productName: orderItemsTable.productName,
        totalSold: sql<number>`sum(${orderItemsTable.quantity})`.as("total_sold"),
        totalRevenue: sql<number>`sum(${orderItemsTable.subtotal})`.as("total_revenue"),
      })
        .from(orderItemsTable)
        .groupBy(orderItemsTable.productName)
        .orderBy(sql`sum(${orderItemsTable.subtotal}) desc`)
        .limit(10),

      db.select({
        total: sql<number>`count(*)`.as("total"),
        totalSpend: sql<number>`sum(${customersTable.totalSpend})`.as("total_spend"),
        avgPoints: sql<number>`avg(${customersTable.loyaltyPoints})`.as("avg_points"),
        vipCount: sql<number>`count(*) filter (where 'VIP' = any(${customersTable.tags}))`.as("vip_count"),
      }).from(customersTable),
    ]);

    const totalRevenue = recentOrders.reduce((s, o) => s + o.totalAmount, 0);
    const completedOrders = recentOrders.filter(o => o.status === "completed").length;
    const dineInOrders = recentOrders.filter(o => o.type === "dine-in").length;
    const takeoutOrders = recentOrders.filter(o => o.type === "takeout").length;
    const avgOrderValue = completedOrders > 0 ? totalRevenue / completedOrders : 0;

    const dataContext = `
餐廳過去30天數據摘要：
- 總訂單數：${recentOrders.length}（完成：${completedOrders}）
- 總營收：NT$${totalRevenue.toFixed(0)}
- 平均客單價：NT$${avgOrderValue.toFixed(0)}
- 內用訂單：${dineInOrders}，外帶訂單：${takeoutOrders}

熱銷品項（前5名）：
${topProducts.slice(0, 5).map((p, i) => `${i + 1}. ${p.productName}：賣出 ${p.totalSold} 份，收入 NT$${Number(p.totalRevenue).toFixed(0)}`).join("\n")}

顧客數據：
- 顧客總數：${customerStats[0]?.total ?? 0}
- VIP 顧客：${customerStats[0]?.vipCount ?? 0}
- 平均忠誠點數：${Number(customerStats[0]?.avgPoints ?? 0).toFixed(0)}
- 總累積消費：NT$${Number(customerStats[0]?.totalSpend ?? 0).toFixed(0)}
`;

    const completion = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 2000,
      messages: [
        {
          role: "system",
          content: `你是一位專業的餐飲業AI顧問，擅長分析餐廳營運數據並提供可執行的建議。請用繁體中文回應，並以 JSON 格式輸出分析結果。`,
        },
        {
          role: "user",
          content: dataContext,
        },
      ],
    });

    logger.info?.({
      choicesCount: completion.choices?.length,
      finishReason: completion.choices?.[0]?.finish_reason,
      hasContent: !!completion.choices?.[0]?.message?.content,
    }, "AI response received");

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      logger.error?.({ raw }, "No JSON object found in AI response");
      res.status(500).json({ error: "AI returned invalid format" });
      return;
    }

    const parsed = JSON.parse(jsonMatch[0]);

    res.json({
      generatedAt: new Date().toISOString(),
      summary: parsed.summary ?? "",
      insights: parsed.insights ?? [],
    });
  } catch (err) {
    logger.error?.({ err }, "AI insights failed");
    res.status(500).json({ error: "AI analysis failed" });
  }
});

export default router;
