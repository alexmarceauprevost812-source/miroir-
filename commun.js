// Réglages partagés TV / téléphone.
const PREFIXE = 'miroir-tv-';

// Serveur de signalisation PeerJS : le serveur public par défaut,
// ou un serveur perso via ?signal=https://hote:port/chemin
function optionsPeer() {
  const signal = new URLSearchParams(location.search).get('signal');
  if (!signal) return {};
  const u = new URL(signal);
  return {
    host: u.hostname,
    port: Number(u.port) || (u.protocol === 'https:' ? 443 : 80),
    path: u.pathname,
    secure: u.protocol === 'https:',
  };
}
