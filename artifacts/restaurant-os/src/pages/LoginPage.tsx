
export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="p-8 rounded-2xl shadow-xl border w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6">Restaurant OS Login</h1>

        <form className="space-y-4">
          <input
            className="w-full border rounded-xl p-3"
            placeholder="Email"
          />

          <input
            type="password"
            className="w-full border rounded-xl p-3"
            placeholder="Password"
          />

          <button
            className="w-full rounded-xl p-3 border"
            type="submit"
          >
            Login
          </button>
        </form>
      </div>
    </div>
  );
}
