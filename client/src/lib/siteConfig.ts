const hostname = typeof window !== 'undefined' ? window.location.hostname : '';

export const onAmuseBouche = hostname.includes('amuseboucheinsider');
export const onArtistryNerdistry = hostname.includes('artistrynerdistry');
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
