import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, Search, Database, Activity } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface DiscoveryStats {
  artistsSearched: number;
  eventsFound: number;
  newEventsAdded: number;
  errors: number;
  duration: number;
}

interface DiscoveryStatus {
  isRunning: boolean;
  stats: DiscoveryStats;
}

interface Artist {
  id: number;
  name: string;
  genre: string;
  source: string;
  searchPriority: string;
  lastSearched: string | null;
  lastFoundEvent: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
}

export default function Discovery() {
  const [limit, setLimit] = useState(5);
  const [dryRun, setDryRun] = useState(true);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Get discovery status
  const { data: status, isLoading: statusLoading } = useQuery<DiscoveryStatus>({
    queryKey: ['/api/discovery/status'],
    refetchInterval: 2000, // Refresh every 2 seconds when running
  });

  // Get artist database stats
  const { data: artists, isLoading: artistsLoading } = useQuery<Artist[]>({
    queryKey: ['/api/artists'],
  });

  // Run discovery mutation
  const runDiscoveryMutation = useMutation({
    mutationFn: async (options: { limit: number; dryRun: boolean }) => {
      const response = await fetch('/api/discovery/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });
      
      if (!response.ok) {
        throw new Error('Discovery failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Discovery completed",
        description: `Found ${data.stats.newEventsAdded} new events from ${data.stats.artistsSearched} artists`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/discovery/status'] });
      queryClient.invalidateQueries({ queryKey: ['/api/events'] });
    },
    onError: (error) => {
      toast({
        title: "Discovery failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  const artistStats = artists ? {
    total: artists.length,
    bySource: artists.reduce((acc, artist) => {
      acc[artist.source] = (acc[artist.source] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    byPriority: artists.reduce((acc, artist) => {
      acc[artist.searchPriority] = (acc[artist.searchPriority] || 0) + 1;
      return acc;
    }, {} as Record<string, number>),
    neverSearched: artists.filter(a => !a.lastSearched).length,
    foundEvents: artists.filter(a => a.lastFoundEvent).length,
  } : null;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">Automated Event Discovery</h1>
          <p className="text-muted-foreground">AI-powered system to find Denver area concerts for artists in our database</p>
        </div>

        {/* Status Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Discovery Status */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Discovery Status</CardTitle>
              <Activity className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {statusLoading ? (
                  <div className="flex items-center space-x-2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span className="text-sm">Loading...</span>
                  </div>
                ) : (
                  <>
                    <Badge variant={status?.isRunning ? "default" : "secondary"}>
                      {status?.isRunning ? "Running" : "Idle"}
                    </Badge>
                    {status?.stats && (
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div>Last run: {status.stats.artistsSearched} artists searched</div>
                        <div>Found: {status.stats.eventsFound} potential events</div>
                        <div>Added: {status.stats.newEventsAdded} new events</div>
                        {status.stats.errors > 0 && (
                          <div className="text-destructive">Errors: {status.stats.errors}</div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Artist Database */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Artist Database</CardTitle>
              <Database className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {artistsLoading ? (
                <div className="flex items-center space-x-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Loading...</span>
                </div>
              ) : artistStats ? (
                <div className="space-y-2">
                  <div className="text-2xl font-bold">{artistStats.total}</div>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <div>Never searched: {artistStats.neverSearched}</div>
                    <div>Found events: {artistStats.foundEvents}</div>
                    <div className="flex gap-1 flex-wrap">
                      {Object.entries(artistStats.bySource).map(([source, count]) => (
                        <Badge key={source} variant="outline" className="text-xs">
                          {source}: {count}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <span className="text-sm text-muted-foreground">No data</span>
              )}
            </CardContent>
          </Card>

          {/* Discovery Controls */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Run Discovery</CardTitle>
              <Search className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                <label className="text-xs font-medium">Artists to search</label>
                <select 
                  value={limit} 
                  onChange={(e) => setLimit(Number(e.target.value))}
                  className="w-full text-sm border rounded px-2 py-1"
                >
                  <option value={3}>3 artists</option>
                  <option value={5}>5 artists</option>
                  <option value={10}>10 artists</option>
                  <option value={20}>20 artists</option>
                </select>
              </div>
              
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="dryRun"
                  checked={dryRun}
                  onChange={(e) => setDryRun(e.target.checked)}
                  className="w-4 h-4"
                />
                <label htmlFor="dryRun" className="text-xs">Dry run (preview only)</label>
              </div>

              <Button
                onClick={() => runDiscoveryMutation.mutate({ limit, dryRun })}
                disabled={status?.isRunning || runDiscoveryMutation.isPending}
                className="w-full"
                size="sm"
              >
                {runDiscoveryMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Running...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 mr-2" />
                    Start Discovery
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Recent Artists */}
        {artists && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Artists</CardTitle>
              <CardDescription>Artists in the database ready for event discovery</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
                {artists.slice(0, 50).map((artist) => (
                  <div key={artist.id} className="border rounded-lg p-3 space-y-2">
                    <div className="font-medium text-sm">{artist.name}</div>
                    <div className="flex gap-1 flex-wrap">
                      <Badge variant="outline" className="text-xs">{artist.genre}</Badge>
                      <Badge variant="outline" className="text-xs">{artist.source}</Badge>
                      <Badge variant="outline" className="text-xs">{artist.searchPriority}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {artist.lastSearched ? (
                        <div>Last searched: {new Date(artist.lastSearched).toLocaleDateString()}</div>
                      ) : (
                        <div>Never searched</div>
                      )}
                      {artist.lastFoundEvent && (
                        <div>Found event: {new Date(artist.lastFoundEvent).toLocaleDateString()}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}