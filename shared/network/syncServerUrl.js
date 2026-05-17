/**
 * WebSocket URL for the sync relay.
 * In Vite dev, use the dev server's host + `/sync-ws` proxy so phones/tablets on the LAN work (localhost would point at the wrong machine).
 * Override with `VITE_SYNC_SERVER_URL` in `.env` if needed.
 */
export function getSyncServerUrl(runtimeFallback) {
  const envUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SYNC_SERVER_URL;
  if (envUrl) {
    return envUrl;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV && typeof window !== 'undefined') {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/sync-ws`;
  }
  return runtimeFallback;
}
