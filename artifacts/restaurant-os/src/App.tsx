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
import KitchenDisplay from "@/pages/KitchenDisplay";
import Inventory from "@/pages/Inventory";
import Analytics from "@/pages/Analytics";
import NotFound from "@/pages/not-found";
import { isAuthenticated, clearToken } from "@/hooks/use-auth";
import { ApiError } from "@workspace/api-client-react";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status === 401) return false;
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

function AuthGuard({ children }: { children: React.ReactNode }) {
  if (!isAuthenticated()) {
    return <Redirect to="/login" />;
  }
  return <>{children}</>;
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route>
        <AuthGuard>
          <Layout>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/kitchen" component={KitchenDisplay} />
              <Route path="/customers/:id" component={CustomerProfile} />
              <Route path="/customers" component={Customers} />
              <Route path="/reservations" component={Reservations} />
              <Route path="/orders/:id" component={OrderDetail} />
              <Route path="/orders" component={Orders} />
              <Route path="/staff" component={Staff} />
              <Route path="/products" component={Products} />
              <Route path="/floor-plan" component={FloorPlan} />
              <Route path="/inventory" component={Inventory} />
              <Route path="/analytics" component={Analytics} />
              <Route component={NotFound} />
            </Switch>
          </Layout>
        </AuthGuard>
      </Route>
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
