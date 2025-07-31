import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Plus, MoreVertical, Edit, Trash2 } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";

import type { Playlist } from "@shared/schema";

function formatDate(dateString: Date | string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function getMonthTag(dateString: Date | string): { month: string; color: string } {
  const date = new Date(dateString);
  const month = date.toLocaleDateString('en-US', { month: 'short' });
  
  // Color palette for different months
  const monthColors: Record<string, string> = {
    'Jan': 'bg-red-500 text-white',
    'Feb': 'bg-pink-500 text-white', 
    'Mar': 'bg-green-500 text-white',
    'Apr': 'bg-blue-500 text-white',
    'May': 'bg-purple-500 text-white',
    'Jun': 'bg-yellow-500 text-black',
    'Jul': 'bg-orange-500 text-white',
    'Aug': 'bg-teal-500 text-white',
    'Sep': 'bg-indigo-500 text-white',
    'Oct': 'bg-amber-500 text-black',
    'Nov': 'bg-cyan-500 text-white',
    'Dec': 'bg-rose-500 text-white'
  };
  
  return {
    month,
    color: monthColors[month] || 'bg-gray-500 text-white'
  };
}

function QueuePlaylistCard({ playlist }: { playlist: Playlist }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  return (
    <div className="bg-[#F5F3F0] rounded-lg shadow-md overflow-hidden mb-8 border-2 border-[#FE6B41]">
      <div className="flex flex-col md:flex-row">
        {/* Cover Art - Left Side */}
        <div className="w-full md:w-1/3 lg:w-1/4">
          <div className="aspect-square bg-gray-100 overflow-hidden">
            {playlist.coverUrl && !imageError ? (
              <img
                src={playlist.coverUrl}
                alt={`${playlist.title} cover`}
                className={`w-full h-full object-cover transition-opacity duration-200 ${
                  imageLoaded ? 'opacity-100' : 'opacity-0'
                }`}
                onLoad={() => setImageLoaded(true)}
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#FE6B41] to-[#FEABDA] flex items-center justify-center">
                <span className="text-white font-bold text-4xl">
                  {playlist.title.charAt(0)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Content - Right Side */}
        <div className="flex-1 p-6 md:p-8">
          <div className="flex items-start justify-between mb-4">
            <h2 className="text-3xl font-black text-black uppercase">
              {playlist.title}
            </h2>
            <span className="bg-[#FE6B41] text-white text-xs font-bold uppercase px-3 py-2 rounded">
              COLLABORATIVE
            </span>
          </div>

          <div className="mb-6">
            <h3 className="text-lg font-bold text-gray-800 mb-3">
              Create the perfect collaborative Mixed Tape
            </h3>
            <ul className="text-gray-700 space-y-1 text-sm">
              <li>• Each person gets to add a max of 3 songs to the queue</li>
              <li>• Everyone is allowed to reorder songs for flow</li>
              <li>• Want to add a 4th? Remove one of your other songs + reorder for flow ✨</li>
              <li>• Not in Spotify? Just give us a title or youtube link</li>
              <li>• Wherever it lands by next Monday (or sometimes two Mondays) is our finished work of art</li>
            </ul>
          </div>

          <div className="flex gap-3">
            <a
              href={playlist.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="bg-[#1DB954] hover:bg-[#1ed760] text-white font-bold py-3 px-6 rounded-full transition-colors flex items-center gap-2"
            >
              <ExternalLink className="h-4 w-4" />
              Collaborate on Spotify
            </a>
            <button className="bg-black hover:bg-gray-800 text-[#FEABDA] font-bold py-3 px-6 rounded-full transition-colors">
              Add to Queue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // Override month tag for specific playlists
  const getPlaylistMonthTag = (playlist: Playlist) => {
    if (playlist.title === "Ep. June '25") {
      return { month: 'Jun', color: 'bg-yellow-500 text-black' };
    }
    return getMonthTag(playlist.createdAt || new Date());
  };
  
  const monthTag = getPlaylistMonthTag(playlist);
  const { toast } = useToast();

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", `/api/playlists/${playlist.id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      toast({
        title: "Playlist deleted",
        description: "The playlist has been removed successfully",
      });
    },
    onError: () => {
      toast({
        title: "Delete failed",
        description: "Could not delete the playlist",
        variant: "destructive",
      });
    }
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (data: { curator: string; description: string | null }) => {
      const res = await apiRequest("PATCH", `/api/playlists/${playlist.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      setIsEditModalOpen(false);
      toast({
        title: "Playlist updated",
        description: "The playlist has been updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Update failed",
        description: "Could not update the playlist",
        variant: "destructive",
      });
    }
  });

  return (
    <div className="bg-[#F5F3F0] rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <a
              href={playlist.spotifyUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="block group"
            >
              {/* Cover Art */}
              <div className="relative aspect-square bg-gray-100 overflow-hidden">
                {playlist.coverUrl && !imageError ? (
                  <img
                    src={playlist.coverUrl}
                    alt={`${playlist.title} cover`}
                    className={`w-full h-full object-cover transition-opacity duration-200 ${
                      imageLoaded ? 'opacity-100' : 'opacity-0'
                    }`}
                    onLoad={() => setImageLoaded(true)}
                    onError={() => setImageError(true)}
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#FE6B41] to-[#FEABDA] flex items-center justify-center">
                    <span className="text-white font-bold text-2xl">
                      {playlist.title.charAt(0)}
                    </span>
                  </div>
                )}
                
                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all duration-200 flex items-center justify-center">
                  <ExternalLink className="text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 h-8 w-8" />
                </div>
              </div>

              {/* Content */}
              <div className="p-4">
                {/* Title, Month Tag, and Menu */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-lg line-clamp-2 group-hover:text-[#1DB954] transition-colors flex-1 pr-2">
                    {playlist.title}
                  </h3>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={`${monthTag.color} text-xs font-bold uppercase px-2 py-1`}>
                      {monthTag.month}
                    </span>
                    <DropdownMenu open={isMenuOpen} onOpenChange={setIsMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => e.preventDefault()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-32">
                        <DropdownMenuItem 
                          onClick={(e) => {
                            e.preventDefault();
                            setShowDeleteConfirm(true);
                            setIsMenuOpen(false);
                          }}
                          className="text-red-600"
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>

                {/* Featured Artists */}
                {playlist.featuredArtists && playlist.featuredArtists.length > 0 && (
                  <div className="text-sm text-gray-600 mb-4 relative">
                    <div className="flex flex-wrap gap-x-1 gap-y-0 overflow-hidden max-h-12 leading-tight">
                      {playlist.featuredArtists.slice(0, 15).map((artist, index) => (
                        <span key={index} className="whitespace-nowrap">
                          {artist}{index < Math.min((playlist.featuredArtists?.length || 0) - 1, 14) ? ',' : ''}
                        </span>
                      ))}
                      {(playlist.featuredArtists?.length || 0) > 15 && (
                        <span className="text-gray-400">...</span>
                      )}
                    </div>
                    <div className="absolute bottom-0 left-0 w-full h-3 bg-gradient-to-t from-[#F5F3F0] via-[#F5F3F0]/80 to-transparent pointer-events-none"></div>
                  </div>
                )}

                {/* Track count and followers */}
                <div className="text-xs text-gray-500 mb-0 flex gap-3">
                  {playlist.trackCount && (
                    <span>{playlist.trackCount} tracks</span>
                  )}
                  {playlist.followerCount !== null && playlist.followerCount >= 0 && (
                    <span>{playlist.followerCount} followers</span>
                  )}
                </div>

                {/* Curator */}
                <div className="text-sm text-gray-500">
                  <p>By {playlist.curator}</p>
                </div>
              </div>
            </a>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open in Spotify</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {/* Edit Modal */}
      <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
        <DialogContent className="sm:max-w-md bg-[#F5F3F0]">
          <DialogHeader>
            <DialogTitle>Edit Playlist</DialogTitle>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            updateMutation.mutate({
              curator: formData.get('curator') as string,
              description: formData.get('description') as string || null,
            });
          }} className="space-y-4">
            <div>
              <Label htmlFor="curator">Curator Name</Label>
              <Input
                id="curator"
                name="curator"
                defaultValue={playlist.curator}
                required
              />
            </div>
            
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                name="description"
                defaultValue={playlist.description || ''}
                placeholder="Optional description..."
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsEditModalOpen(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={updateMutation.isPending}
                className="flex-1"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="bg-[#F5F3F0]">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Playlist</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{playlist.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                deleteMutation.mutate();
                setShowDeleteConfirm(false);
              }}
              disabled={deleteMutation.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AddPlaylistForm() {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    curator: "",
    spotifyUrl: ""
  });
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const res = await apiRequest("POST", "/api/playlists", data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/playlists'] });
      setOpen(false);
      setFormData({
        title: "",
        curator: "",
        spotifyUrl: ""
      });
      toast({
        title: "Playlist added!",
        description: "The playlist has been added with Spotify metadata.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error adding playlist",
        description: error.message || "Failed to add playlist",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.spotifyUrl) {
      toast({
        title: "Spotify URL required",
        description: "Please provide a valid Spotify playlist URL",
        variant: "destructive",
      });
      return;
    }
    createMutation.mutate(formData);
  };



  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-black text-[#1DB954] hover:bg-black hover:text-[#41F2EE] rounded-full px-3 py-1.5 font-medium transition-colors">
          <Plus className="h-4 w-4 mr-2" />
          Spotify Playlist
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-[#F5F3F0]">
        <DialogHeader>
          <DialogTitle>Add New Playlist</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="spotifyUrl">Spotify Playlist URL *</Label>
            <Input
              id="spotifyUrl"
              type="url"
              placeholder="https://open.spotify.com/playlist/..."
              value={formData.spotifyUrl}
              onChange={(e) => setFormData({ ...formData, spotifyUrl: e.target.value })}
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Title and details will be automatically fetched from Spotify
            </p>
          </div>
          
          <div>
            <Label htmlFor="curator">Curator Name *</Label>
            <Input
              id="curator"
              placeholder="Your name"
              value={formData.curator}
              onChange={(e) => setFormData({ ...formData, curator: e.target.value })}
              required
            />
          </div>



          <div className="flex gap-2 pt-4">
            <Button 
              type="button" 
              variant="outline" 
              onClick={() => setOpen(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={createMutation.isPending}
              className="flex-1 bg-black text-[#1DB954] hover:bg-black hover:text-[#41F2EE] rounded-full px-3 py-1.5 font-medium transition-colors"
            >
              {createMutation.isPending ? "Adding..." : "Add Playlist"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Playlists() {
  const { data: playlistsData = [], isLoading, error } = useQuery<Playlist[]>({
    queryKey: ['/api/playlists'],
    // The default queryFn will automatically make the API call
  });

  // Function to parse episode date from title
  const parseEpisodeDate = (title: string): Date | null => {
    const episodeRegex = /^Ep\.\s+([A-Za-z]+)\s+(\d+)\s+'(\d{2})$/;
    const match = title.match(episodeRegex);
    
    if (!match) return null;
    
    const [, monthStr, dayStr, yearStr] = match;
    const monthMap: { [key: string]: number } = {
      'jan': 0, 'january': 0,
      'feb': 1, 'february': 1,
      'mar': 2, 'march': 2,
      'apr': 3, 'april': 3,
      'may': 4,
      'jun': 5, 'june': 5,
      'jul': 6, 'july': 6,
      'aug': 7, 'august': 7,
      'sep': 8, 'september': 8,
      'oct': 9, 'october': 9,
      'nov': 10, 'november': 10,
      'dec': 11, 'december': 11
    };
    
    const monthIndex = monthMap[monthStr.toLowerCase()];
    if (monthIndex === undefined) return null;
    
    const day = parseInt(dayStr, 10);
    const year = parseInt('20' + yearStr, 10); // Convert '25 to 2025
    
    return new Date(year, monthIndex, day);
  };

  // Separate queue playlist from regular playlists
  const queuePlaylist = playlistsData.find(p => p.title === "Queue it up");
  const regularPlaylists = playlistsData
    .filter(p => p.title !== "Queue it up")
    .sort((a, b) => {
      const aCreated = new Date(a.createdAt || 0);
      const bCreated = new Date(b.createdAt || 0);
      return bCreated.getTime() - aCreated.getTime();
    });

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-black uppercase text-center">COMMUNITY PLAYLISTS</h1>
          </div>
          <div>
            <AddPlaylistForm />
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-12">
            <p className="text-gray-500">Loading playlists...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="text-center py-12">
            <p className="text-red-500">Error loading playlists</p>
          </div>
        )}

        {/* Queue Playlist - Always at Top */}
        {!isLoading && !error && queuePlaylist && (
          <QueuePlaylistCard playlist={queuePlaylist} />
        )}

        {/* Regular Playlists Grid */}
        {!isLoading && !error && regularPlaylists.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-12">
            {regularPlaylists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && playlistsData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 text-lg mb-4">No playlists available yet</p>
            <p className="text-gray-400">Check back soon for curated music collections!</p>
          </div>
        )}


      </main>
      
      <Footer />
    </div>
  );
}