import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
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
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function isAuthenticated(): boolean {
  return !!localStorage.getItem("auth_token");
}

function AuthGuard({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
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
              <Route path="/customers/:id" component={CustomerProfile} />
              <Route path="/customers" component={Customers} />
              <Route path="/reservations" component={Reservations} />
              <Route path="/orders/:id" component={OrderDetail} />
              <Route path="/orders" component={Orders} />
              <Route path="/staff" component={Staff} />
              <Route path="/products" component={Products} />
              <Route path="/floor-plan" component={FloorPlan} />
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
