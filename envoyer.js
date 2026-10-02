// Page téléphone : se connecte à la TV et lui envoie l'écran, la caméra ou un fichier.

const $ = (id) => document.getElementById(id);
const etat = (t) => { $('etat').textContent = t; };
const apercu = $('apercu');
const champCode = $('code');

champCode.value = (new URLSearchParams(location.search).get('code') || '').toUpperCase();

const ecranDispo = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
if (!ecranDispo) {
  $('btnEcran').disabled = true;
  $('avertissement').hidden = false;
}

let fluxCourant = null;
let appelCourant = null;
let nettoyage = null;

const peer = new Peer(optionsPeer());
peer.on('open', () => etat(champCode.value ? 'Prêt. Choisissez quoi partager.' : 'Entrez le code affiché sur la TV.'));
peer.on('error', (err) => etat('Erreur : ' + (err.type === 'peer-unavailable' ? 'TV introuvable, vérifiez le code.' : err.type)));
peer.on('disconnected', () => peer.reconnect());

function arreter() {
  if (appelCourant) appelCourant.close();
  if (fluxCourant) fluxCourant.getTracks().forEach((p) => p.stop());
  if (nettoyage) nettoyage();
  appelCourant = fluxCourant = nettoyage = null;
  apercu.srcObject = null;
  apercu.classList.remove('actif');
  $('btnStop').hidden = true;
}

function envoyer(flux) {
  const code = champCode.value.trim().toUpperCase();
  if (!code) { etat('Entrez le code affiché sur la TV.'); flux.getTracks().forEach((p) => p.stop()); return; }
  arreter();
  fluxCourant = flux;
  apercu.srcObject = flux;
  apercu.classList.add('actif');
  $('btnStop').hidden = false;

  const appel = peer.call(PREFIXE + code, flux);
  appelCourant = appel;
  etat('Connexion à la TV…');
  appel.on('stream', () => {});
  // PeerJS n'émet pas d'événement côté appelant à la connexion ; on surveille l'état ICE.
  const pc = appel.peerConnection;
  if (pc) pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'connected') etat('✅ Affiché sur la TV');
    if (pc.connectionState === 'failed') etat('Échec de la connexion (réseau).');
  });
  appel.on('close', () => { if (appelCourant === appel) { arreter(); etat('Partage arrêté.'); } });

  // Si l'utilisateur arrête le partage depuis le système.
  flux.getVideoTracks().forEach((p) => p.addEventListener('ended', () => { arreter(); etat('Partage arrêté.'); }));
}

$('btnEcran').addEventListener('click', async () => {
  try {
    envoyer(await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true }));
  } catch (e) { etat('Partage d\'écran refusé ou impossible.'); }
});

$('btnCamera').addEventListener('click', async () => {
  try {
    envoyer(await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: true }));
  } catch (e) { etat('Accès à la caméra refusé.'); }
});

$('btnStop').addEventListener('click', () => { arreter(); etat('Partage arrêté.'); });

// Fichiers : envoyés par morceaux sur un canal de données, la TV les affiche.
const TAILLE_MORCEAU = 64 * 1024;
const TAMPON_MAX = 4 * 1024 * 1024;
let connexion = null;
let fileEnvoi = Promise.resolve();

function ouvrirConnexion(code) {
  if (connexion && connexion.open && connexion.peer === PREFIXE + code) return Promise.resolve(connexion);
  if (connexion) connexion.close();
  return new Promise((ok, echec) => {
    const c = peer.connect(PREFIXE + code, { reliable: true });
    c.on('open', () => { connexion = c; ok(c); });
    c.on('error', echec);
    c.on('close', () => { if (connexion === c) connexion = null; });
    setTimeout(() => echec(new Error('délai dépassé')), 15000);
  });
}

function attendreTampon(c) {
  return new Promise((ok, echec) => {
    const verifier = () => {
      if (!c.open || c.dataChannel.readyState !== 'open') return echec(new Error('connexion fermée'));
      if (c.dataChannel.bufferedAmount < TAMPON_MAX) return ok();
      setTimeout(verifier, 30);
    };
    verifier();
  });
}

function taille(o) {
  if (o < 1024) return o + ' o';
  if (o < 1048576) return (o / 1024).toFixed(0) + ' Ko';
  if (o < 1073741824) return (o / 1048576).toFixed(1) + ' Mo';
  return (o / 1073741824).toFixed(2) + ' Go';
}

async function envoyerFichier(fichier, ligne) {
  const code = champCode.value.trim().toUpperCase();
  const c = await ouvrirConnexion(code);
  const id = Math.random().toString(36).slice(2);
  c.send({ t: 'debut', id, nom: fichier.name, mime: fichier.type, taille: fichier.size });
  for (let pos = 0; pos < fichier.size; pos += TAILLE_MORCEAU) {
    const morceau = await fichier.slice(pos, pos + TAILLE_MORCEAU).arrayBuffer();
    await attendreTampon(c);
    c.send({ t: 'morceau', id, d: morceau });
    ligne.querySelector('progress').value = Math.min(1, (pos + TAILLE_MORCEAU) / fichier.size);
  }
  c.send({ t: 'fin', id });
}

$('fichier').addEventListener('change', (ev) => {
  const fichiers = [...ev.target.files];
  ev.target.value = '';
  if (!fichiers.length) return;
  if (!champCode.value.trim()) { etat('Entrez le code affiché sur la TV.'); return; }
  etat('Envoi des fichiers à la TV…');
  for (const fichier of fichiers) {
    const ligne = document.createElement('li');
    ligne.innerHTML = '<span></span><progress max="1" value="0"></progress>';
    ligne.firstChild.textContent = fichier.name + ' (' + taille(fichier.size) + ')';
    $('envois').prepend(ligne);
    fileEnvoi = fileEnvoi
      .then(() => envoyerFichier(fichier, ligne))
      .then(() => { ligne.classList.add('ok'); etat('✅ Fichier envoyé à la TV'); })
      .catch(() => { ligne.classList.add('erreur'); etat('Échec de l\'envoi. Vérifiez le code de la TV.'); });
  }
});
