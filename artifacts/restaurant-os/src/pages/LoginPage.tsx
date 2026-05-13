import { useState } from "react";
import { useLocation } from "wouter";
import { authenticateWithPassword, type AuthMode, type AuthRole } from "@/hooks/use-auth";
import { API_BASE_URL } from "@/lib/api-env";
import { ChefHat } from "lucide-react";

const roles: Array<{ value: AuthRole; label: string; description: string }> = [
  { value: "admin", label: "Admin", description: "全系統管理" },
  { value: "manager", label: "Manager", description: "營運管理" },
  { value: "staff", label: "Staff", description: "前場作業" },
  { value: "kitchen", label: "Kitchen", description: "KDS 出餐" },
];

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<AuthRole>("manager");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  const isRegister = mode === "register";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (isRegister && password !== confirmPassword) {
      setError("兩次輸入的密碼不一致。");
      return;
    }

    setLoading(true);
    try {
      await authenticateWithPassword(mode, {
        name: isRegister ? name : undefined,
        email: email.trim(),
        password,
        confirmPassword: isRegister ? confirmPassword : undefined,
        role: isRegister ? role : undefined,
        accountType: isRegister ? role : undefined,
      });
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "驗證失敗，請稍後再試。");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary mb-4 shadow-lg">
            <ChefHat className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">AI-native Operating System</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isRegister ? "建立餐飲垂直版本的工作帳號" : "登入 restaurant-os 營運控制台"}
          </p>
        </div>

        <div className="bg-card border border-card-border rounded-2xl p-5 sm:p-8 shadow-sm">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1 mb-5" role="tablist" aria-label="驗證方式">
            <button
              type="button"
              className={`min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === "login" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              登入
            </button>
            <button
              type="button"
              className={`min-h-11 rounded-md px-3 py-2 text-sm font-medium transition-colors ${mode === "register" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              註冊
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            {isRegister && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">姓名</label>
                <input
                  className="w-full min-h-11 border border-border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                  placeholder="Jane Manager"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  required={isRegister}
                  autoComplete="name"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">電子郵件</label>
              <input
                className="w-full min-h-11 border border-border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="admin@restaurant.com"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">密碼</label>
              <input
                type="password"
                className="w-full min-h-11 border border-border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                placeholder="至少 8 個字元"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={isRegister ? 8 : 1}
                autoComplete={isRegister ? "new-password" : "current-password"}
              />
            </div>

            {isRegister && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">確認密碼</label>
                  <input
                    type="password"
                    className="w-full min-h-11 border border-border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    placeholder="再次輸入密碼"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    required={isRegister}
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">角色 / 帳號類型</label>
                  <select
                    className="w-full min-h-11 border border-border rounded-lg px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition-colors"
                    value={role}
                    onChange={e => setRole(e.target.value as AuthRole)}
                  >
                    {roles.map((item) => (
                      <option key={item.value} value={item.value}>{item.label} — {item.description}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">{error}</p>
            )}

            <button
              className="w-full min-h-11 rounded-lg py-2.5 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors mt-2"
              type="submit"
              disabled={loading}
            >
              {loading ? (isRegister ? "註冊中…" : "登入中…") : (isRegister ? "註冊並進入" : "登入")}
            </button>
          </form>

          <p className="break-all text-xs text-muted-foreground text-center mt-5">
            API：{API_BASE_URL}
          </p>
        </div>
      </div>
    </div>
  );
}
