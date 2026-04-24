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
  genre: string;
  status: 'pending' | 'approved' | 'rejected';
  discoveredAt: string;
  confidence?: number;
}

interface DiscoveredArtist {
  id: number;
  name: string;
  genre: string;
  source: string;
  description?: string;
  confidence: number;
  isReviewed: boolean;
  isApproved?: boolean;
  reviewNotes?: string;
  createdAt: string;
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
  const [venuePriority, setVenuePriority] = useState('red-rocks');
  const [omrCity, setOmrCity] = useState('nyc');
  const [addArtistOpen, setAddArtistOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Service health check
  const { data: serviceHealth } = useQuery({
    queryKey: ["/api/admin/service-health"],
    queryFn: async () => {
      const r = await fetch("/api/admin/service-health");
      return r.json();
    },
    refetchInterval: 60_000, // re-check every minute
    staleTime: 30_000,
  });

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
        title: "Event Removed",
        description: "Event has been successfully rejected and removed from view",
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

  // Venue discovery mutation
  const runVenueDiscoveryMutation = useMutation({
    mutationFn: async ({ venueLimit, priority, dryRun }: { venueLimit: number; priority?: string; dryRun?: boolean }) => {
      return apiRequest({
        endpoint: "/api/discovery/venue-scan",
        method: "POST",
        data: { venueLimit, priority, dryRun }
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-events"] });
      toast({
        title: "Venue Discovery Complete",
        description: data.message || "Venue scan completed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Venue Discovery Failed",
        description: error.message || "Failed to scan venues",
        variant: "destructive",
      });
    }
  });

  // Artist discovery mutation
  const runArtistDiscoveryMutation = useMutation({
    mutationFn: async ({ sources, limit, dryRun }: { sources: string[]; limit: number; dryRun?: boolean }) => {
      return apiRequest({
        endpoint: "/api/discovery/artist-scan",
        method: "POST",
        data: { sources, limit, dryRun }
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/artists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-artists"] });
      toast({
        title: "Artist Discovery Complete",
        description: data.message || "Artist discovery completed successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Artist Discovery Failed",
        description: error.message || "Failed to discover new artists",
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

  // Discovered artists mutations
  const approveArtistMutation = useMutation({
    mutationFn: async (artistId: number) => {
      return apiRequest({
        endpoint: `/api/discovered-artists/${artistId}/approve`,
        method: "POST"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-artists"] });
      queryClient.invalidateQueries({ queryKey: ["/api/artists"] });
      toast({
        title: "Artist Approved",
        description: "Artist has been added to the database",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve artist",
        variant: "destructive",
      });
    }
  });

  const rejectArtistMutation = useMutation({
    mutationFn: async (artistId: number) => {
      return apiRequest({
        endpoint: `/api/discovered-artists/${artistId}/reject`,
        method: "POST"
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/discovered-artists"] });
      toast({
        title: "Artist Rejected",
        description: "Artist has been marked as rejected",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Rejection Failed",
        description: error.message || "Failed to reject artist",
        variant: "destructive",
      });
    }
  });

  const { data: discoveredArtists = [] } = useQuery({
    queryKey: ["/api/discovered-artists"],
    queryFn: () => apiRequest({ endpoint: "/api/discovered-artists" }),
  });

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
            <h1 className="text-2xl text-black">DISCOVERY ADMIN</h1>
          </div>
        </div>
      </div>

      {/* Service health banner */}
      {serviceHealth && Object.values(serviceHealth).some((s: any) => !s.ok) && (
        <div className="bg-yellow-50 border-b border-yellow-300 px-4 py-2">
          <div className="container mx-auto flex flex-wrap gap-x-6 gap-y-1 items-center text-sm">
            <span className="font-bold text-yellow-800 uppercase text-xs tracking-wide">⚠ Service Status</span>
            {Object.entries(serviceHealth).map(([name, status]: [string, any]) => (
              <span key={name} className={`flex items-center gap-1 text-xs font-medium ${status.ok ? 'text-green-700' : 'text-red-700'}`}>
                {status.ok ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                <span className="capitalize">{name}</span>: {status.message}
                {!status.ok && name === 'serper' && (
                  <a href="https://serper.dev" target="_blank" rel="noopener noreferrer"
                    className="underline ml-1 text-red-600 hover:text-red-800">Top up at serper.dev →</a>
                )}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-8">
        <Tabs defaultValue="artist-review" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="artist-review">Artist Review</TabsTrigger>
            <TabsTrigger value="review">Event Review</TabsTrigger>
            <TabsTrigger value="artists">Artist Database</TabsTrigger>
          </TabsList>

          {/* Artist Review Tab */}
          <TabsContent value="artist-review" className="space-y-6">
            {/* Artist Research Tools */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="text-lg font-semibold mb-4">🎤 Artist Research Tools</h3>
              <p className="text-sm text-gray-600 mb-4">Manually research and discover new artists to add to your database</p>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">📰 Check Pitchfork</h4>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">See the latest highly-rated artists from Pitchfork Best New Albums</p>
                      <Button
                        onClick={() => runArtistDiscoveryMutation.mutate({ 
                          sources: ['pitchfork'],
                          limit: 10,
                          dryRun: true 
                        })}
                        disabled={runArtistDiscoveryMutation.isPending}
                        variant="outline"
                        className="w-full"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Preview Pitchfork Artists
                      </Button>
                      <Button
                        onClick={() => runArtistDiscoveryMutation.mutate({ 
                          sources: ['pitchfork'],
                          limit: 10,
                          dryRun: false 
                        })}
                        disabled={runArtistDiscoveryMutation.isPending}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Discover & Queue Pitchfork Artists
                      </Button>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">🎸 Check Oh My Rockness</h4>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">See recommended artists from Oh My Rockness shows feed</p>
                      <Select value={omrCity} onValueChange={setOmrCity}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select city..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="nyc">NYC (ohmyrockness.com)</SelectItem>
                          <SelectItem value="chicago">Chicago (chicago.ohmyrockness.com)</SelectItem>
                          <SelectItem value="la">LA (losangeles.ohmyrockness.com)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => runArtistDiscoveryMutation.mutate({ 
                          sources: ['oh_my_rockness'],
                          limit: 10,
                          dryRun: true,
                          city: omrCity
                        })}
                        disabled={runArtistDiscoveryMutation.isPending}
                        variant="outline"
                        className="w-full"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Preview OMR {omrCity.toUpperCase()} Artists
                      </Button>
                      <Button
                        onClick={() => runArtistDiscoveryMutation.mutate({ 
                          sources: ['oh_my_rockness'],
                          limit: 10,
                          dryRun: false,
                          city: omrCity
                        })}
                        disabled={runArtistDiscoveryMutation.isPending}
                        className="w-full"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Discover & Queue OMR {omrCity.toUpperCase()} Artists
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-purple-700 bg-purple-50 p-3 rounded">
                  <strong>Research Mode:</strong> Preview artists before adding them. Review results and manually add the ones you want to track.
                </div>
              </div>
            </div>

            {/* Artist Review Queue */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Music className="w-5 h-5 mr-2" />
                Artist Review Queue
              </h2>
              {discoveredArtists.filter(artist => !artist.isReviewed).length === 0 ? (
                <p className="text-gray-500">No artists awaiting review</p>
              ) : (
                <div className="space-y-4">
                  {discoveredArtists
                    .filter(artist => !artist.isReviewed)
                    .map(artist => (
                      <div key={artist.id} className="border rounded-lg p-4 bg-blue-50">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex-1">
                            <h3 className="font-medium text-lg">{artist.name}</h3>
                            <p className="text-gray-600">{artist.genre}</p>
                            {artist.description && (
                              <p className="text-sm text-gray-600 mt-1">{artist.description}</p>
                            )}
                            <div className="flex items-center space-x-3 mt-2">
                              <Badge variant="outline" className="bg-blue-100">
                                {artist.source.replace(/_/g, ' ').toUpperCase()}
                              </Badge>
                              <span className="text-sm text-gray-500">
                                Confidence: {Math.round(artist.confidence * 100)}%
                              </span>
                            </div>
                          </div>
                          <div className="flex space-x-2 ml-4">
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700"
                              onClick={() => approveArtistMutation.mutate(artist.id)}
                              disabled={approveArtistMutation.isPending}
                            >
                              <CheckCircle className="w-4 h-4 mr-1" />
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-red-500 text-red-500 hover:bg-red-50"
                              onClick={() => rejectArtistMutation.mutate(artist.id)}
                              disabled={rejectArtistMutation.isPending}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        </div>
                        <div className="text-xs text-gray-500">
                          Discovered: {formatDate(artist.createdAt)}
                        </div>
                      </div>
                    ))}
                </div>
              )}
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

            {/* Venue Discovery Tools */}
            <div className="bg-white rounded-lg p-6 shadow-sm border">
              <h3 className="text-lg font-semibold mb-4">🏟️ Venue Discovery Tools</h3>
              <p className="text-sm text-gray-600 mb-4">Test venue calendar scraping and search for events at specific venues</p>
              
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">🏟️ Single Venue Check</h4>
                    <div className="space-y-3">
                      <Select value={venuePriority} onValueChange={setVenuePriority}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choose venue..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="red-rocks">Red Rocks Amphitheatre</SelectItem>
                          <SelectItem value="mission-ballroom">Mission Ballroom</SelectItem>
                          <SelectItem value="fillmore">Fillmore Auditorium</SelectItem>
                          <SelectItem value="ogden">Ogden Theatre</SelectItem>
                          <SelectItem value="hi-dive">Hi-Dive</SelectItem>
                          <SelectItem value="skylark">Skylark Lounge</SelectItem>
                          <SelectItem value="ball-arena">Ball Arena</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button 
                        onClick={() => runVenueDiscoveryMutation.mutate({ 
                          venueLimit: 1,
                          priority: venuePriority,
                          dryRun: true 
                        })}
                        disabled={runVenueDiscoveryMutation.isPending}
                        variant="outline" 
                        className="w-full"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Check Venue Calendar
                      </Button>
                    </div>
                  </div>
                  
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium mb-3">🔍 Venue Scraping Test</h4>
                    <div className="space-y-3">
                      <p className="text-sm text-gray-600">Test venue calendar scraping with detailed results</p>
                      <Select defaultValue="next-30">
                        <SelectTrigger>
                          <SelectValue placeholder="Date range..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="next-30">Next 30 days</SelectItem>
                          <SelectItem value="next-60">Next 60 days</SelectItem>
                          <SelectItem value="next-90">Next 90 days</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => runVenueDiscoveryMutation.mutate({ 
                          venueLimit: 1,
                          priority: venuePriority,
                          dryRun: true 
                        })}
                        disabled={runVenueDiscoveryMutation.isPending}
                        className="w-full bg-blue-600 hover:bg-blue-700"
                      >
                        <Search className="w-4 h-4 mr-2" />
                        Test Venue Scraping
                      </Button>
                    </div>
                  </div>
                </div>
                
                <div className="text-sm text-blue-700 bg-blue-50 p-3 rounded">
                  <strong>Test Mode:</strong> These tools let you test venue scraping one venue at a time with full visibility into results and event parsing.
                </div>
              </div>
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