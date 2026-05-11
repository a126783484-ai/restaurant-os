import { useGetAiInsights } from "@workspace/api-client-react";
import { Brain, TrendingUp, Users, UtensilsCrossed, BarChart3, UserCog, RefreshCw, Sparkles, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bg: string; label: string }> = {
  revenue: { icon: TrendingUp, color: "text-green-600 dark:text-green-400", bg: "bg-green-100 dark:bg-green-900/40", label: "營收" },
  customer: { icon: Users, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-900/40", label: "顧客" },
  menu: { icon: UtensilsCrossed, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-900/40", label: "菜單" },
  operations: { icon: BarChart3, color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-100 dark:bg-purple-900/40", label: "營運" },
  staff: { icon: UserCog, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-900/40", label: "人力" },
};

const PRIORITY_STYLES: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-muted",
};

const PRIORITY_LABELS: Record<string, string> = {
  high: "高優先",
  medium: "中優先",
  low: "低優先",
};

interface Insight {
  type: string;
  priority: string;
  title: string;
  content: string;
  action?: string;
}

function InsightCard({ insight }: { insight: Insight }) {
  const cfg = TYPE_CONFIG[insight.type] ?? TYPE_CONFIG.operations;
  const Icon = cfg.icon;

  return (
    <div className={cn("bg-card border border-card-border rounded-xl p-5 border-l-4", PRIORITY_STYLES[insight.priority] ?? "border-l-muted")}>
      <div className="flex items-start gap-3">
        <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center shrink-0", cfg.bg)}>
          <Icon className={cn("h-4.5 w-4.5", cfg.color)} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <h3 className="text-sm font-bold text-foreground">{insight.title}</h3>
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
              {cfg.label}
            </span>
            <span className={cn(
              "text-[10px] font-semibold px-1.5 py-0.5 rounded",
              insight.priority === "high" ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" :
              insight.priority === "medium" ? "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" :
              "bg-muted text-muted-foreground"
            )}>
              {PRIORITY_LABELS[insight.priority] ?? insight.priority}
            </span>
          </div>
          <p className="text-sm text-foreground/80 leading-relaxed">{insight.content}</p>
          {insight.action && (
            <div className="mt-3 flex items-start gap-2">
              <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
              <p className="text-xs text-primary font-medium">{insight.action}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { mutate, data, isPending, error, isIdle } = useGetAiInsights();

  const handleGenerate = () => {
    mutate();
  };

  const insights: Insight[] = (data as { insights?: Insight[] } | undefined)?.insights ?? [];
  const summary: string = (data as { summary?: string } | undefined)?.summary ?? "";
  const generatedAt: string = (data as { generatedAt?: string } | undefined)?.generatedAt ?? "";

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-foreground">AI 智慧分析</h1>
          <p className="text-sm text-muted-foreground mt-0.5">基於過去30天營運數據的 AI 洞察與建議</p>
        </div>
        <Button onClick={handleGenerate} disabled={isPending} className="gap-2">
          {isPending ? (
            <><RefreshCw className="h-4 w-4 animate-spin" /> 分析中…</>
          ) : (
            <><Brain className="h-4 w-4" /> {data ? "重新分析" : "開始分析"}</>
          )}
        </Button>
      </div>

      {isIdle && !isPending && (
        <div className="bg-card border border-card-border rounded-2xl p-12 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Brain className="h-8 w-8 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">AI 店長助理</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto mb-6">
            點擊「開始分析」，AI 將分析您過去30天的訂單、顧客、菜單數據，並提供具體可執行的營運建議。
          </p>
          <div className="flex flex-wrap justify-center gap-3 text-xs text-muted-foreground">
            {Object.values(TYPE_CONFIG).map(cfg => {
              const Icon = cfg.icon;
              return (
                <div key={cfg.label} className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-full", cfg.bg)}>
                  <Icon className={cn("h-3.5 w-3.5", cfg.color)} />
                  <span className={cfg.color}>{cfg.label}分析</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {isPending && (
        <div className="space-y-4">
          <div className="bg-card border border-card-border rounded-xl p-5 animate-pulse">
            <div className="h-4 bg-muted rounded w-3/4 mb-2" />
            <div className="h-3 bg-muted rounded w-1/2" />
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-card-border rounded-xl p-5 animate-pulse border-l-4 border-l-muted">
              <div className="flex gap-3">
                <div className="w-9 h-9 bg-muted rounded-lg shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && !isPending && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-700 dark:text-red-400">分析失敗</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/80 mt-0.5">AI 分析暫時無法使用，請稍後再試。</p>
          </div>
        </div>
      )}

      {data && !isPending && (
        <>
          {summary && (
            <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 flex items-start gap-3">
              <Sparkles className="h-5 w-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">AI 總結</p>
                <p className="text-sm text-foreground font-medium">{summary}</p>
                {generatedAt && (
                  <p className="text-xs text-muted-foreground mt-1">
                    分析時間：{new Date(generatedAt).toLocaleString("zh-TW", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="space-y-4">
            {insights
              .sort((a, b) => {
                const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
                return (order[a.priority] ?? 2) - (order[b.priority] ?? 2);
              })
              .map((insight, i) => <InsightCard key={i} insight={insight} />)
            }
          </div>
        </>
      )}
    </div>
  );
}
