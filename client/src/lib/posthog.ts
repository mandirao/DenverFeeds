import posthog from 'posthog-js';

const key = import.meta.env.VITE_POSTHOG_KEY as string | undefined;

export function initPostHog() {
  if (!key) return;
  posthog.init(key, {
    api_host: 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: true,
    persistence: 'localStorage',
  });
}

export function capturePageView(path: string, site: string) {
  if (!key) return;
  posthog.capture('$pageview', {
    $current_url: window.location.href,
    path,
    site,
  });
}

export { posthog };
