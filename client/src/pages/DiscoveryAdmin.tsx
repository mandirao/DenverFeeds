import { useState, useEffect } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue 
} from "@/components/ui/select";
import { 
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow 
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { 
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter 
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { 
  ArrowLeft, 
  Search, 
  Play, 
  Pause, 
  Plus, 
  Trash2, 
  Calendar,
  Users,
  Music,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Check,
  X
} from "lucide-react";

interface Artist {
  id: number;
  name: string;
  genre: string;
  priority: 'high' | 'medium' | 'low';
  source: string;
  lastSearched?: string;
  lastFoundEvent?: string;
  searchHistory: number;
}

interface DiscoveredEvent {
  id: number;
  artist: string;
  venue: string;
  date: string;
  summary: string;
  soundsLike: string;
  genre: string;
  status: 'pending' | 'approved' | 'rejected';
  discoveredAt: string;
}

interface DiscoveryStats {
  isRunning: boolean;
  stats: {
    artistsSearched: number;
    eventsFound: number;
    newEventsAdded: number;
    errors: number;
    duration: number;
  };
}

export default function DiscoveryAdmin() {
  const [newArtistName, setNewArtistName] = useState("");
  const [newArtistGenre, setNewArtistGenre] = useState("");
  const [newArtistPriority, setNewArtistPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [searchLimit, setSearchLimit] = useState(5);
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch artists
  const { data: artists = [], isLoading: artistsLoading } = useQuery({
    queryKey: ["/api/artists"],
    queryFn: async () => {
      const response = await apiRequest({ endpoint: "/api/artists", method: "GET" });
      return response;
    }
  });

  // Fetch discovered events for review
  const { data: discoveredEvents = [], isLoading: discoveredEventsLoading } = useQuery({
    queryKey: ["/api/discovered-events"],
    queryFn: async () => {
      const response = await apiRequest({ endpoint: "/api/discovered-events", method: "GET" });
      return response;
    }
  });

  // Fetch discovery status/stats
  const { data: discoveryStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["/api/discovery/status"],
    queryFn: async () => {
      const response = await apiRequest({ endpoint: "/api/discovery/status", method: "GET" });
      return response;
    },
    refetchInterval: (data: any) => data?.isRunning ? 2000 : false
  });

  // Add artist mutation
  const addArtistMutation = useMutation({
    mutationFn: async (artistData: { name: string; genre: string; priority: string; source: string }) => {
      return apiRequest({
        endpoint: "/api/artists",
        method: "POST",
        data: artistData
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artists"] });
      setNewArtistName("");
      setNewArtistGenre("");
      setNewArtistPriority('medium');
      setAddArtistOpen(false);
      toast({
        title: "Artist Added",
        description: "Artist has been added to the database",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add artist",
        variant: "destructive",
      });
    }
  });

  // Delete artist mutation
  const deleteArtistMutation = useMutation({
    mutationFn: async (artistId: number) => {
      return apiRequest({
        endpoint: `/api/artists/${artistId}`,
        method: "DELETE"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/artists"] });
      toast({
        title: "Artist Removed",
        description: "Artist has been removed from the database",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove artist",
        variant: "destructive",
      });
    }
  });

  // Run discovery mutation
  const runDiscoveryMutation = useMutation({
    mutationFn: async ({ limit, dryRun }: { limit: number; dryRun?: boolean }) => {
      return apiRequest({
        endpoint: "/api/discovery/run",
        method: "POST",
        data: { limit, dryRun: dryRun || false }
      });
    },
    onSuccess: (data) => {
      refetchStatus();
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-events"] });
      toast({
        title: "Discovery Complete",
        description: data.message || "Discovery session completed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Discovery Error",
        description: error.message || "Failed to run discovery",
        variant: "destructive",
      });
    }
  });

  // Approve discovered event mutation
  const approveEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      return apiRequest({
        endpoint: `/api/discovered-events/${eventId}/approve`,
        method: "POST"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({
        title: "Event Approved",
        description: "Event has been added to the main feed",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve event",
        variant: "destructive",
      });
    }
  });

  // Reject discovered event mutation
  const rejectEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      return apiRequest({
        endpoint: `/api/discovered-events/${eventId}/reject`,
        method: "POST"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-events"] });
      toast({
        title: "Event Rejected",
        description: "Event has been marked as rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject event",
        variant: "destructive",
      });
    }
  });

  const handleAddArtist = () => {
    if (!newArtistName?.trim() || !newArtistGenre?.trim()) {
      toast({
        title: "Validation Error",
        description: "Please fill in both artist name and genre",
        variant: "destructive",
      });
      return;
    }

    addArtistMutation.mutate({
      name: newArtistName.trim(),
      genre: newArtistGenre.trim(),
      priority: newArtistPriority,
      source: 'Manual Admin'
    });
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleDateString();
  };

  const formatDuration = (ms: number) => {
    if (!ms) return "0s";
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F3F0]">
      {/* Header */}
      <div className="bg-[#FE6B41] shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link href="/" className="flex items-center text-black hover:text-white transition-colors">
                <ArrowLeft className="w-5 h-5 mr-2" />
                <span className="font-medium">Back to Shows</span>
              </Link>
            </div>
            <h1 className="text-2xl font-anton text-black">DISCOVERY ADMIN</h1>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="discovery" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="discovery">Discovery Control</TabsTrigger>
            <TabsTrigger value="review">Event Review</TabsTrigger>
            <TabsTrigger value="artists">Artist Database</TabsTrigger>
          </TabsList>

          {/* Discovery Control Tab */}
          <TabsContent value="discovery" className="space-y-6">
            {/* Discovery Stats */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold flex items-center">
                  {discoveryStatus?.isRunning ? (
                    <>
                      <Play className="w-5 h-5 mr-2 text-green-500" />
                      Discovery Running...
                    </>
                  ) : (
                    <>
                      <Pause className="w-5 h-5 mr-2 text-gray-500" />
                      Discovery Idle
                    </>
                  )}
                </h2>
                {discoveryStatus?.isRunning && (
                  <Badge variant="secondary" className="animate-pulse">
                    Running
                  </Badge>
                )}
              </div>
              
              {discoveryStatus?.stats && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <Users className="w-6 h-6 mx-auto mb-1 text-gray-600" />
                    <div className="text-2xl font-bold">{discoveryStatus.stats.artistsSearched}</div>
                    <div className="text-sm text-gray-600">Artists Searched</div>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded">
                    <Music className="w-6 h-6 mx-auto mb-1 text-blue-600" />
                    <div className="text-2xl font-bold">{discoveryStatus.stats.eventsFound}</div>
                    <div className="text-sm text-gray-600">Events Found</div>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded">
                    <CheckCircle className="w-6 h-6 mx-auto mb-1 text-green-600" />
                    <div className="text-2xl font-bold">{discoveryStatus.stats.newEventsAdded}</div>
                    <div className="text-sm text-gray-600">Events Added</div>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded">
                    <XCircle className="w-6 h-6 mx-auto mb-1 text-red-600" />
                    <div className="text-2xl font-bold">{discoveryStatus.stats.errors}</div>
                    <div className="text-sm text-gray-600">Errors</div>
                  </div>
                  <div className="text-center p-3 bg-gray-50 rounded">
                    <Clock className="w-6 h-6 mx-auto mb-1 text-gray-600" />
                    <div className="text-2xl font-bold">{formatDuration(discoveryStatus.stats.duration)}</div>
                    <div className="text-sm text-gray-600">Duration</div>
                  </div>
                </div>
              )}
            </div>

            {/* Discovery Controls */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h2 className="text-xl font-semibold mb-4">Manual Discovery</h2>
              <div className="flex items-end space-x-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium mb-2">Number of Artists to Search</label>
                  <Input
                    type="number"
                    min="1"
                    max="50"
                    value={searchLimit}
                    onChange={(e) => setSearchLimit(parseInt(e.target.value) || 5)}
                    className="w-20"
                  />
                </div>
                <div className="flex space-x-2">
                  <Button
                    onClick={() => runDiscoveryMutation.mutate({ limit: searchLimit, dryRun: true })}
                    disabled={discoveryStatus?.isRunning || runDiscoveryMutation.isPending}
                    variant="outline"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Test Run
                  </Button>
                  <Button
                    onClick={() => runDiscoveryMutation.mutate({ limit: searchLimit })}
                    disabled={discoveryStatus?.isRunning || runDiscoveryMutation.isPending}
                    className="bg-[#FE6B41] hover:bg-[#FE6B41]/90"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    Run Discovery
                  </Button>
                </div>
              </div>
              <div className="mt-3 p-3 bg-yellow-50 rounded border border-yellow-200">
                <div className="flex items-start">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-2 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-yellow-800">
                    <div className="font-medium">Research Mode Active</div>
                    <div>Discovery finds potential events but requires manual verification before adding to prevent false information. Use the Add Show form to verify and add discovered events.</div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Event Review Tab */}
          <TabsContent value="review" className="space-y-6">
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Discovered Events Review Queue</h2>
                <Badge variant="secondary">
                  {discoveredEvents.filter((e: any) => e.status === 'pending').length} pending
                </Badge>
              </div>
              <p className="text-gray-600 mb-6">
                Events discovered by the AI system are queued here for manual review before being added to the main feed.
              </p>
              
              {discoveredEventsLoading ? (
                <div className="text-center py-8">
                  <div className="inline-flex items-center">
                    <span className="mr-2">Loading discovered events...</span>
                  </div>
                </div>
              ) : discoveredEvents.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  No discovered events pending review.
                  <br />
                  <span className="text-sm">Run a discovery session to find new events for review.</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {discoveredEvents.map((event: any) => (
                    <div key={event.id} className="border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg">{event.artist}</h3>
                            <Badge 
                              variant={event.status === 'pending' ? 'default' : event.status === 'approved' ? 'secondary' : 'destructive'}
                            >
                              {event.status}
                            </Badge>
                            {event.confidence && (
                              <Badge variant="outline">{event.confidence}% confidence</Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                            <div><strong>Venue:</strong> {event.venue}</div>
                            <div><strong>Date:</strong> {new Date(event.date).toLocaleDateString()}</div>
                            <div><strong>Genre:</strong> {event.genre}</div>
                            <div><strong>Discovered:</strong> {new Date(event.discoveredAt).toLocaleDateString()}</div>
                          </div>
                          {event.summary && (
                            <p className="text-sm text-gray-700 mb-2">
                              <strong>Summary:</strong> {event.summary}
                            </p>
                          )}
                          {event.soundsLike && (
                            <p className="text-sm text-gray-700">
                              <strong>Sounds Like:</strong> {event.soundsLike}
                            </p>
                          )}
                        </div>
                        
                        {event.status === 'pending' && (
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => approveEventMutation.mutate(event.id)}
                              disabled={approveEventMutation.isPending}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              <Check className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => rejectEventMutation.mutate(event.id)}
                              disabled={rejectEventMutation.isPending}
                            >
                              <X className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>

          {/* Artist Database Tab */}
          <TabsContent value="artists" className="space-y-6">
            {/* Add Artist */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Artist Database ({artists.length} artists)</h2>
                <Button 
                  onClick={() => setAddArtistOpen(true)}
                  className="bg-[#FE6B41] hover:bg-[#FE6B41]/90"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Artist
                </Button>
              </div>

              {/* Artists Table */}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Artist</TableHead>
                      <TableHead>Genre</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Last Searched</TableHead>
                      <TableHead>Last Found</TableHead>
                      <TableHead>Searches</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {artistsLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8">
                          Loading artists...
                        </TableCell>
                      </TableRow>
                    ) : artists.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-gray-500">
                          No artists in database
                        </TableCell>
                      </TableRow>
                    ) : (
                      artists.map((artist: Artist) => (
                        <TableRow key={artist.id}>
                          <TableCell className="font-medium">{artist.name}</TableCell>
                          <TableCell>{artist.genre}</TableCell>
                          <TableCell>
                            <Badge className={`${getPriorityColor(artist.priority)} text-white`}>
                              {artist.priority}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{artist.source}</TableCell>
                          <TableCell className="text-sm">{formatDate(artist.lastSearched)}</TableCell>
                          <TableCell className="text-sm">{formatDate(artist.lastFoundEvent)}</TableCell>
                          <TableCell>{artist.searchHistory || 0}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteArtistMutation.mutate(artist.id)}
                              disabled={deleteArtistMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Artist Dialog */}
      <Dialog open={addArtistOpen} onOpenChange={setAddArtistOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Artist</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Artist Name</label>
              <Input
                value={newArtistName}
                onChange={(e) => setNewArtistName(e.target.value)}
                placeholder="Enter artist name..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Genre</label>
              <Select value={newArtistGenre} onValueChange={setNewArtistGenre}>
                <SelectTrigger>
                  <SelectValue placeholder="Select genre..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Rock & Alternative">Rock & Alternative</SelectItem>
                  <SelectItem value="Folk">Folk</SelectItem>
                  <SelectItem value="Country & Americana">Country & Americana</SelectItem>
                  <SelectItem value="Pop & Indie Pop">Pop & Indie Pop</SelectItem>
                  <SelectItem value="Electronic & Experimental">Electronic & Experimental</SelectItem>
                  <SelectItem value="Funk, Soul & Jazz">Funk, Soul & Jazz</SelectItem>
                  <SelectItem value="Classical & Orchestral">Classical & Orchestral</SelectItem>
                  <SelectItem value="Hip Hop & R&B">Hip Hop & R&B</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Priority</label>
              <Select value={newArtistPriority} onValueChange={(value: 'high' | 'medium' | 'low') => setNewArtistPriority(value)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddArtistOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAddArtist}
              disabled={addArtistMutation.isPending}
              className="bg-[#FE6B41] hover:bg-[#FE6B41]/90"
            >
              Add Artist
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}