import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/Home";
import AddEvent from "@/pages/AddEvent";
import Playlists from "@/pages/Playlists";
import NotFound from "@/pages/not-found";
import { TooltipProvider } from "@/components/ui/tooltip";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/add" component={AddEvent} />
      <Route path="/playlists" component={Playlists} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Router />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
