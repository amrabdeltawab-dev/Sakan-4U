import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Account from "@/pages/Account";
import Admin from "@/pages/Admin";
import Auth from "@/pages/Auth";
import Favorites from "@/pages/Favorites";
import Home from "@/pages/Home";
import NotFound from "@/pages/NotFound";
import Owner from "@/pages/Owner";
import PropertyDetails from "@/pages/PropertyDetails";
import ResetPassword from "@/pages/ResetPassword";
import Settings from "@/pages/Settings";
import ServerError from "@/pages/ServerError";
import SuperAdmin from "@/pages/SuperAdmin";
import Terms from "@/pages/Terms";
import Privacy from "@/pages/Privacy";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { GoogleAnalyticsPageTracker } from "./components/GoogleAnalyticsPageTracker";
import { ThemeProvider } from "./contexts/ThemeContext";

function Router() {
  return <Switch>
    <Route path="/" component={Home} />
    <Route path="/property/:id" component={PropertyDetails} />
    <Route path="/login">{() => <Auth mode="login" />}</Route>
    <Route path="/signup/student">{() => <Auth mode="student" />}</Route>
    <Route path="/signup/owner">{() => <Auth mode="owner" />}</Route>
    <Route path="/forgot-password">{() => <Auth mode="forgot" />}</Route>
    <Route path="/reset-password" component={ResetPassword} />
    <Route path="/terms" component={Terms} />
    <Route path="/privacy" component={Privacy} />
    <Route path="/account" component={Account} />
    <Route path="/favorites" component={Favorites} />
    <Route path="/settings" component={Settings} />
    <Route path="/owner" component={Owner} />
    <Route path="/admin" component={Admin} />
    <Route path="/super-admin" component={SuperAdmin} />
    <Route path="/404" component={NotFound} />
    <Route path="/500">{() => <ServerError />}</Route>
    <Route component={NotFound} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><GoogleAnalyticsPageTracker /><Toaster richColors position="top-center" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
