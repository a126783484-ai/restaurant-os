import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import LoginPage from "@/pages/LoginPage";
import Dashboard from "@/pages/Dashboard";
import Customers from "@/pages/Customers";
import CustomerProfile from "@/pages/CustomerProfile";
import Reservations from "@/pages/Reservations";
import Orders from "@/pages/Orders";
import OrderDetail from "@/pages/OrderDetail";
import Staff from "@/pages/Staff";
import Products from "@/pages/Products";
import FloorPlan from "@/pages/FloorPlan";
import TableManagement from "@/pages/TableManagement";
import KitchenDisplay from "@/pages/KitchenDisplay";
import Inventory from "@/pages/Inventory";
import Analytics from "@/pages/Analytics";
import NotFound from "@/pages/not-found";
import { clearToken, getToken, useAuthSession, type AuthRole } from "@/hooks/use-auth";
import { ApiError, setAuthTokenGetter } from "@workspace/api-client-react";

setAuthTokenGetter(() => getToken());

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return false;
        return failureCount < 1;
      },
      staleTime: 30_000,
    },
    mutations: {
      onError: (error) => {
        if (error instanceof ApiError && error.status === 401) {
          clearToken();
          window.location.href = `${import.meta.env.BASE_URL}login`;
        }
      },
    },
  },
});

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="min-h-[60vh] px-4 py-10 flex items-center justify-center">
      <div className="max-w-md rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">權限不足</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

function AuthGuard({ children, roles }: { children: React.ReactNode; roles?: AuthRole[] }) {
  const { user, loading, error } = useAuthSession();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4 text-sm text-muted-foreground">
        正在驗證登入狀態…
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/login" />;
  }

  if (roles?.length && !roles.includes(user.role)) {
    return <AccessDenied message={error ?? "你的角色無法存取此頁面。請切換帳號或聯絡系統管理員。"} />;
  }

  return <>{children}</>;
}

function ProtectedPage({ children, roles }: { children: React.ReactNode; roles?: AuthRole[] }) {
  return (
    <AuthGuard roles={roles}>
      <Layout>{children}</Layout>
    </AuthGuard>
  );
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <ProtectedPage><Dashboard /></ProtectedPage>
      </Route>
      <Route path="/kitchen">
        <ProtectedPage roles={["admin", "manager", "kitchen"]}><KitchenDisplay /></ProtectedPage>
      </Route>
      <Route path="/customers/:id">
        <ProtectedPage><CustomerProfile /></ProtectedPage>
      </Route>
      <Route path="/customers">
        <ProtectedPage><Customers /></ProtectedPage>
      </Route>
      <Route path="/reservations">
        <ProtectedPage><Reservations /></ProtectedPage>
      </Route>
      <Route path="/orders/:id">
        <ProtectedPage><OrderDetail /></ProtectedPage>
      </Route>
      <Route path="/orders">
        <ProtectedPage><Orders /></ProtectedPage>
      </Route>
      <Route path="/staff">
        <ProtectedPage roles={["admin", "manager"]}><Staff /></ProtectedPage>
      </Route>
      <Route path="/products">
        <ProtectedPage roles={["admin", "manager", "staff"]}><Products /></ProtectedPage>
      </Route>
      <Route path="/floor-plan">
        <ProtectedPage roles={["admin", "manager", "staff"]}><TableManagement /></ProtectedPage>
      </Route>
      <Route path="/floor-view">
        <ProtectedPage roles={["admin", "manager", "staff"]}><FloorPlan /></ProtectedPage>
      </Route>
      <Route path="/inventory">
        <ProtectedPage roles={["admin", "manager", "staff"]}><Inventory /></ProtectedPage>
      </Route>
      <Route path="/analytics">
        <ProtectedPage roles={["admin", "manager"]}><Analytics /></ProtectedPage>
      </Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
