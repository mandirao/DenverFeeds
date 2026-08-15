const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

// Each site is its own domain in prod, so hostname is authoritative there.
// The /amuse-bouche and /artistry-nerdistry paths only exist as a local dev
// preview convenience, so fall back to pathname when hostname doesn't match.
export const onAmuseBouche = hostname.includes('amuseboucheinsider') || pathname.startsWith('/amuse-bouche');
export const onArtistryNerdistry = hostname.includes('artistrynerdistry') || pathname.startsWith('/artistry-nerdistry');
export const onSetlistSocial = !onAmuseBouche && !onArtistryNerdistry;

const isProd =
  hostname.includes('setlistsocial') ||
  hostname.includes('amuseboucheinsider') ||
  hostname.includes('artistrynerdistry');

export const siteUrls = {
  setlist: isProd ? 'https://setlistsocialfeed.com' : '/',
  amuseBouche: isProd ? 'https://amuseboucheinsider.com' : '/amuse-bouche',
  artistryNerdistry: isProd ? 'https://artistrynerdistry.com' : '/artistry-nerdistry',
};

export type SiteKey = 'setlist' | 'amuseBouche' | 'artistryNerdistry';

export const currentSiteKey: SiteKey = onAmuseBouche
  ? 'amuseBouche'
  : onArtistryNerdistry
  ? 'artistryNerdistry'
  : 'setlist';

// Alphabetical by name — the site switcher dropdown always lists every site
// in this fixed order, including whichever one is currently active.
export const sites: { key: SiteKey; name: string; emoji: string; url: string; focusColor: string }[] = [
  { key: 'amuseBouche', name: 'Amuse-Bouche Insider', emoji: '🍽️', url: siteUrls.amuseBouche, focusColor: '#FFF8E7' },
  { key: 'artistryNerdistry', name: 'Artistry/Nerdistry Live', emoji: '🎨', url: siteUrls.artistryNerdistry, focusColor: '#F2F0FF' },
  { key: 'setlist', name: 'Setlist Social Feed', emoji: '🎵', url: siteUrls.setlist, focusColor: '#FEABDA' },
];
