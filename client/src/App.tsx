import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import Home from "@/pages/Home";
import AddEvent from "@/pages/AddEvent";
import Playlists from "@/pages/Playlists";
import Discovery from "@/pages/Discovery";
import DiscoveryAdmin from "@/pages/DiscoveryAdmin";
import AmsueBouche from "@/pages/AmsueBouche";
import ArtistryNerdery from "@/pages/ArtistryNerdery";
import NotFound from "@/pages/not-found";
import { TooltipProvider } from "@/components/ui/tooltip";
import { onAmuseBouche, onArtistryNerdistry } from "@/lib/siteConfig";

// Set the browser tab title based on which domain is active
document.title = onAmuseBouche
  ? 'Amuse-Bouche Insider'
  : onArtistryNerdistry
  ? 'Artistry/Nerdistry Live'
  : 'Setlist Social Feed';

function RootPage() {
  if (onAmuseBouche) return <AmsueBouche />;
  if (onArtistryNerdistry) return <ArtistryNerdery />;
  return <Home />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootPage} />
      <Route path="/add" component={AddEvent} />
      <Route path="/playlists" component={Playlists} />
      <Route path="/discovery" component={DiscoveryAdmin} />
      <Route path="/amuse-bouche" component={AmsueBouche} />
      <Route path="/artistry-nerdistry" component={ArtistryNerdery} />
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
