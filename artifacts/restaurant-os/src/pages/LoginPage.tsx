import { useState } from "react";
import { useLocation } from "wouter";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [, navigate] = useLocation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? "Invalid credentials");
        return;
      }
      const data = await res.json();
      localStorage.setItem("auth_token", data.token ?? "authenticated");
      navigate("/");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-8 rounded-2xl shadow-xl border w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Restaurant OS Login</h1>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <input
            className="w-full border rounded-xl p-3"
            placeholder="Email"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />

          <input
            type="password"
            className="w-full border rounded-xl p-3"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <button
            className="w-full rounded-xl p-3 border bg-primary text-primary-foreground disabled:opacity-60"
            type="submit"
            disabled={loading}
          >
            {loading ? "Logging in…" : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
}
