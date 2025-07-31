import React, { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ExternalLink } from "lucide-react";

import type { Playlist } from "@shared/schema";

function formatDate(dateString: Date | string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

function PlaylistCard({ playlist }: { playlist: Playlist }) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

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
                {/* Genre Tag */}
                <div className="mb-2">
                  <span className={`inline-block text-xs font-bold uppercase px-2 py-1 rounded ${
                    playlist.genre === 'ROCK' ? 'bg-red-100 text-red-800' :
                    playlist.genre === 'RAP' ? 'bg-purple-100 text-purple-800' :
                    'bg-blue-100 text-blue-800'
                  }`}>
                    {playlist.genre}
                  </span>
                </div>

                {/* Title */}
                <h3 className="font-bold text-lg mb-1 line-clamp-2 group-hover:text-[#1DB954] transition-colors">
                  {playlist.title}
                </h3>

                {/* Artist */}
                <p className="text-gray-600 mb-2 font-medium">
                  {playlist.artist}
                </p>

                {/* Curator and Date */}
                <div className="text-sm text-gray-500">
                  <p>By {playlist.curator}</p>
                  <p>{formatDate(playlist.createdAt || new Date())}</p>
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

export default function Playlists() {
  const { data: playlists = [], isLoading, error } = useQuery<Playlist[]>({
    queryKey: ['/api/playlists'],
    // The default queryFn will automatically make the API call
  });

  return (
    <div className="min-h-screen bg-[#f8f8f8]">
      <Navbar />
      
      <main className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-black text-black mb-2">CURATED PLAYLISTS</h1>
          <p className="text-gray-600 text-lg">
            Discover handpicked music collections from our community contributors
          </p>
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

        {/* Spotify Integration Note */}
        <div className="mt-12 p-6 bg-white rounded-lg border border-gray-200">
          <h3 className="font-bold text-lg mb-2">🎵 Enhanced Spotify Integration</h3>
          <p className="text-gray-600 mb-4">
            To automatically pull cover art, track counts, and other metadata from Spotify playlists, 
            we'll need a Spotify API key. This will enable:
          </p>
          <ul className="text-gray-600 space-y-1 ml-4">
            <li>• Automatic cover art retrieval</li>
            <li>• Real-time track counts and duration</li>
            <li>• Playlist descriptions and followers</li>
            <li>• Recently updated playlists</li>
          </ul>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}