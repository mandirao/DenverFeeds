# Setlist Social Feed

## Overview

This is a concert feed/newsletter application designed for an exclusive meetup group to discover, vote on, and organize attendance for upcoming music shows. The application allows users to browse concerts in a chronologically organized feed, upvote events they're interested in, and interact with event details through integrated third-party services like Google Calendar, Google Maps, and Spotify.

## User Preferences

**Communication Style**: Simple, everyday language.

**Content Voice & Tone**: Casual cool style inspired by Oh My Rockness and Pitchfork. Casual and descriptive but compelling—no forced hype. Describe sound with confidence, not exaggeration (no "mind-blowing" or "life-changing" unless it actually is). Include brief unfussy history/origin/bio when relevant. Keep it tight, direct, and useful. Describe signature sound & style in a relatable and slightly wry way, rather than breathless and over-the-top. Avoid over-explaining genres; describe their vibe instead.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **Routing**: Wouter for lightweight client-side routing
- **State Management**: TanStack Query for server state management with optimistic updates
- **UI Components**: Radix UI primitives with shadcn/ui component library
- **Styling**: Tailwind CSS with custom design system featuring orange (#FE6B41) and pink (#FEABDA) color scheme
- **Forms**: React Hook Form with Zod validation for type-safe form handling

### Backend Architecture
- **Runtime**: Node.js with Express server
- **Database ORM**: Drizzle ORM for type-safe database operations
- **Session Management**: Express sessions with PostgreSQL session store using connect-pg-simple
- **File Processing**: Papa Parse for CSV import functionality
- **API Design**: RESTful API with endpoints for events, upvotes, and bulk operations

### Data Storage
- **Primary Database**: PostgreSQL with Neon serverless driver
- **Schema**: Events table with fields for artist, venue, date, genre, upvotes, and scheduling status
- **Artist Database**: 362+ artists with tracking fields for search history, discovery source, and priority
- **Session Storage**: PostgreSQL-backed session table for user state persistence
- **Migrations**: Drizzle migrations for schema management

### Authentication & Authorization
- **Session-based Authentication**: UUID-based sessions stored in PostgreSQL
- **User Management**: Simple user identification through session IDs without traditional login
- **Admin Features**: Role-based actions for scheduling events and managing upvotes
- **CSRF Protection**: Built into Express session configuration

### Key Features & Design Patterns
- **Event Filtering**: Multi-dimensional filtering by month, genre, location (Denver area), and recency
- **Interactive Elements**: Click-to-action integration with Google Calendar, Maps, and Spotify
- **Bulk Import**: CSV upload with duplicate detection and validation
- **Real-time Updates**: Optimistic UI updates with TanStack Query cache invalidation
- **Responsive Design**: Mobile-first approach with custom breakpoints
- **Empty States**: Contextual messaging for filtered results
- **Automated Discovery**: AI-powered system that searches for Denver area concerts using artist database
- **Artist Database**: 362+ artists from existing events plus manual additions, organized by genre and source
- **Discovery Admin UI**: Real-time monitoring and control interface for automated event discovery
- **Discovery Link**: Hidden admin panel access through Upload CSV modal for privileged users
- **Research Mode**: Discovery system operates in research-only mode to prevent false event creation
- **Venue-First Discovery**: Efficient discovery system monitoring 25 key Denver venues (94% fewer API calls vs artist-by-artist)
- **Event Review System**: Manual approval workflow for discovered events with confidence scoring
- **Comprehensive Duplicate Detection**: Artist discovery system checks against both main artists and discovered_artists tables to prevent re-discovery of existing artists

## External Dependencies

### Database & Infrastructure
- **Neon Database**: Serverless PostgreSQL hosting
- **WebSocket Support**: For Neon database connections using ws library

### UI & Styling
- **Radix UI**: Accessible component primitives for dialogs, dropdowns, tooltips
- **Tailwind CSS**: Utility-first CSS framework with custom color variables
- **Lucide React**: Icon library for consistent iconography
- **Class Variance Authority**: Type-safe CSS class composition

### Third-party Integrations
- **Google Calendar**: Event scheduling through URL generation
- **Google Maps**: Venue location lookup via search URLs  
- **Spotify**: Artist discovery through search URLs
- **Papa Parse**: CSV file parsing for bulk event imports

### Development Tools
- **TypeScript**: Full type safety across frontend and backend
- **Vite**: Fast development server with HMR support
- **ESBuild**: Production bundling for server-side code
- **Drizzle Kit**: Database schema management and migrations

### Form Handling & Validation
- **React Hook Form**: Performant form state management
- **Zod**: Runtime type validation for API requests and form data
- **Hookform Resolvers**: Integration between React Hook Form and Zod