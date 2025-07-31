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
import { useToast } from "@/hooks/use-toast";
import { ExternalLink, Plus } from "lucide-react";
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

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);
  const monthTag = getMonthTag(playlist.createdAt || new Date());

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden hover:shadow-md transition-shadow">
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
                {/* Title and Month Tag */}
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-bold text-lg line-clamp-2 group-hover:text-[#1DB954] transition-colors flex-1">
                    {playlist.title}
                  </h3>
                  <span className={`${monthTag.color} text-xs font-bold uppercase px-2 py-1 ml-2 flex-shrink-0`}>
                    {monthTag.month}
                  </span>
                </div>

                {/* Description */}
                {playlist.description && (
                  <p className="text-sm text-gray-600 mb-2 line-clamp-2">
                    {playlist.description}
                  </p>
                )}

                {/* Track count and followers */}
                <div className="text-xs text-gray-500 mb-2 flex gap-3">
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
        <Button className="bg-[#1DB954] hover:bg-[#1aa34a] text-white">
          <Plus className="h-4 w-4 mr-2" />
          Add Playlist
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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
              className="flex-1 bg-[#1DB954] hover:bg-[#1aa34a] text-white"
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
  const { data: playlists = [], isLoading, error } = useQuery<Playlist[]>({
    queryKey: ['/api/playlists'],
    // The default queryFn will automatically make the API call
  });

  return (
    <div className="min-h-screen bg-[#FE6B41]">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black text-black mb-2">CURATED PLAYLISTS</h1>
            <p className="text-gray-600 text-lg">
              Discover handpicked music collections from our community contributors
            </p>
          </div>
          <div className="sm:flex-shrink-0">
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

        {/* Playlists Grid */}
        {!isLoading && !error && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {playlists.map((playlist) => (
              <PlaylistCard key={playlist.id} playlist={playlist} />
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && !error && playlists.length === 0 && (
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