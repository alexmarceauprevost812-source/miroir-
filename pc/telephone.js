'use strict';
// Page téléphone du hub Miroir : fichiers, texte, télécommande, webcam, notifications.

const $ = (id) => document.getElementById(id);
const ONGLETS = ['fichiers', 'texte', 'telecommande', 'webcam', 'notifications'];

// Le jeton du QR est déjà dans un cookie : on le retire de l'adresse affichée.
if (location.search) history.replaceState(null, '', '/' + location.hash);

let minuteurMessage;
function message(texte, erreur = false) {
  const m = $('message');
  m.textContent = texte;
  m.classList.toggle('erreur', erreur);
  m.hidden = false;
  clearTimeout(minuteurMessage);
  minuteurMessage = setTimeout(() => { m.hidden = true; }, 3000);
}

async function api(chemin, options = {}) {
  const r = await fetch(chemin, { ...options, headers: { 'X-Miroir': '1', ...(options.headers || {}) } });
  if (r.status === 401) {
    message('Session expirée : scannez à nouveau le code QR du PC.', true);
    throw new Error('non autorisé');
  }
  if (!r.ok) {
    let erreur = 'Erreur ' + r.status;
    try { erreur = (await r.json()).erreur || erreur; } catch (e) { /* corps vide */ }
    throw new Error(erreur);
  }
  return r;
}
const poster = (chemin, corps) => api(chemin, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps),
});

function taille(o) {
  if (o < 1024) return o + ' o';
  if (o < 1048576) return (o / 1024).toFixed(0) + ' Ko';
  if (o < 1073741824) return (o / 1048576).toFixed(1) + ' Mo';
  return (o / 1073741824).toFixed(2) + ' Go';
}

// ---------- onglets ----------
function ouvrirOnglet(nom) {
  if (!ONGLETS.includes(nom)) nom = 'fichiers';
  for (const o of ONGLETS) $(o).hidden = o !== nom;
  for (const b of document.querySelectorAll('#onglets button')) {
    if (b.dataset.onglet === nom) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  }
  history.replaceState(null, '', '#' + nom);
  if (nom === 'fichiers') chargerPartages();
}
$('onglets').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) ouvrirOnglet(b.dataset.onglet);
});

// ---------- état du PC ----------
let etat = {};
async function chargerEtat() {
  etat = await (await api('/api/etat')).json();
  $('machine').textContent = 'Connecté à ' + etat.machine;
  $('dossier').textContent = etat.dossier;
  $('urlNotif').textContent = etat.url_notification;
  $('ppManque').hidden = !!etat.presse_papiers;
  $('copierPc').disabled = $('lirePc').disabled = !etat.presse_papiers;
  $('ctManque').hidden = !!etat.controle;
  $('notifManque').hidden = !!etat.notifications;
}

// ---------- fichiers ----------
let fileEnvoi = Promise.resolve();

function envoyerFichier(fichier, ligne) {
  return new Promise((ok, echec) => {
    const r = new XMLHttpRequest();
    r.open('PUT', '/api/envoi?nom=' + encodeURIComponent(fichier.name));
    r.setRequestHeader('X-Miroir', '1');
    r.upload.onprogress = (e) => { if (e.total) ligne.querySelector('progress').value = e.loaded / e.total; };
    r.onload = () => (r.status === 200 ? ok() : echec(new Error(r.status)));
    r.onerror = () => echec(new Error('réseau'));
    r.send(fichier);
  });
}

$('choix').addEventListener('change', (ev) => {
  for (const fichier of [...ev.target.files]) {
    const ligne = document.createElement('li');
    ligne.innerHTML = '<span></span><progress max="1" value="0"></progress>';
    ligne.firstChild.textContent = fichier.name + ' (' + taille(fichier.size) + ')';
    $('envois').prepend(ligne);
    fileEnvoi = fileEnvoi
      .then(() => envoyerFichier(fichier, ligne))
      .then(() => { ligne.classList.add('ok'); message('Fichier envoyé au PC'); })
      .catch(() => { ligne.classList.add('erreur'); message('Échec de l\'envoi', true); });
  }
  ev.target.value = '';
});

async function chargerPartages() {
  try {
    const fichiers = await (await api('/api/fichiers')).json();
    const liste = $('partages');
    liste.innerHTML = '';
    for (const f of fichiers) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = '/api/fichier?r=' + f.r + '&p=' + encodeURIComponent(f.p);
      a.download = f.nom;
      a.innerHTML = '<span></span><small></small>';
      a.firstChild.textContent = '⬇ ' + (f.p || f.nom);
      a.lastChild.textContent = taille(f.taille);
      li.appendChild(a);
      liste.appendChild(li);
    }
    $('aucunPartage').hidden = fichiers.length > 0;
  } catch (e) { /* message déjà affiché */ }
}
$('rafraichir').addEventListener('click', chargerPartages);

// ---------- texte, liens, presse-papiers ----------
const zone = $('zone');

function enLien(texte) {
  texte = texte.trim();
  if (/^https?:\/\/\S+$/i.test(texte)) return texte;
  if (/^(www\.)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(texte)) return 'https://' + texte;
  return null;
}

async function action(fn, reussite) {
  try { await fn(); message(reussite); } catch (e) { message(e.message, true); }
}

$('copierPc').addEventListener('click', () => action(
  () => poster('/api/presse-papiers', { texte: zone.value }), 'Copié dans le presse-papiers du PC'));

$('ouvrirPc').addEventListener('click', () => {
  const lien = enLien(zone.value);
  if (!lien) return message('Ce n\'est pas un lien web', true);
  action(() => poster('/api/texte', { texte: lien, action: 'ouvrir' }), 'Lien ouvert sur le PC');
});

$('notifierPc').addEventListener('click', () => {
  if (!zone.value.trim()) return message('Écrivez d\'abord un texte', true);
  action(() => poster('/api/texte', { texte: zone.value, action: 'notifier' }), 'Affiché sur le PC');
});

async function copierSurTelephone(texte) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(texte); return true; } catch (e) { /* repli */ }
  }
  zone.select();
  try { return document.execCommand('copy'); } catch (e) { return false; }
}

$('lirePc').addEventListener('click', async () => {
  try {
    const { texte } = await (await api('/api/presse-papiers')).json();
    zone.value = texte;
    message(await copierSurTelephone(texte) ? 'Copié sur le téléphone' : 'Texte récupéré : appui long pour copier');
  } catch (e) { message(e.message, true); }
});

$('collerTel').addEventListener('click', async () => {
  if (navigator.clipboard && navigator.clipboard.readText && window.isSecureContext) {
    try { zone.value = await navigator.clipboard.readText(); return; } catch (e) { /* refusé */ }
  }
  zone.focus();
  message('Appui long dans la zone puis « Coller »');
});

// ---------- télécommande ----------
const controle = (corps) => poster('/api/controle', corps).catch(() => {});

document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  if (navigator.vibrate) navigator.vibrate(10);
  controle({ action: b.dataset.action, valeur: b.dataset.valeur });
});

$('formClavier').addEventListener('submit', (e) => {
  e.preventDefault();
  const texte = $('saisie').value;
  if (!texte) return;
  controle({ action: 'taper', valeur: texte });
  $('saisie').value = '';
});

// Pavé tactile : on accumule les mouvements et on les envoie ~30 fois par seconde.
const pave = $('pave');
const pointeurs = new Map();
let geste = null;
let accX = 0, accY = 0, accDefil = 0, enVol = false;
const PAS_DEFIL = 25;

pave.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  pave.setPointerCapture(e.pointerId);
  pointeurs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!geste) geste = { debut: performance.now(), max: 0, distance: 0 };
  geste.max = Math.max(geste.max, pointeurs.size);
});

pave.addEventListener('pointermove', (e) => {
  const p = pointeurs.get(e.pointerId);
  if (!p || !geste) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  geste.distance += Math.abs(dx) + Math.abs(dy);
  if (pointeurs.size === 1 && geste.max === 1) {
    const s = parseFloat($('sensibilite').value);
    accX += dx * s; accY += dy * s;
  } else if (pointeurs.size >= 2) {
    accDefil += dy / pointeurs.size;
  }
});

function finPointeur(e) {
  if (!pointeurs.delete(e.pointerId) || pointeurs.size || !geste) return;
  if (performance.now() - geste.debut < 250 && geste.distance < 12) {
    controle({ action: 'clic', valeur: geste.max >= 2 ? 'droit' : 'gauche' });
  }
  geste = null;
}
pave.addEventListener('pointerup', finPointeur);
pave.addEventListener('pointercancel', finPointeur);

setInterval(async () => {
  if (enVol) return;
  const dx = Math.trunc(accX), dy = Math.trunc(accY);
  const pas = Math.trunc(accDefil / PAS_DEFIL);
  if (!dx && !dy && !pas) return;
  accX -= dx; accY -= dy; accDefil -= pas * PAS_DEFIL;
  enVol = true;
  try {
    if (dx || dy) await controle({ action: 'deplacer', dx, dy });
    // Doigts vers le haut => le contenu descend (défilement naturel).
    if (pas) await controle({ action: 'defiler', n: -pas });
  } finally { enVol = false; }
}, 33);

// ---------- webcam ----------
let fluxCamera = null, webcamActive = false, verrouEcran = null;
const apercu = $('apercu');
const pause = (ms) => new Promise((ok) => setTimeout(ok, ms));

if (!window.isSecureContext || !navigator.mediaDevices) {
  $('webcamHttps').hidden = false;
  $('webcamCtrl').hidden = true;
}

async function demarrerWebcam() {
  const [l, h] = $('resolution').value.split('x').map(Number);
  try {
    fluxCamera = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: $('cameraSens').value, width: { ideal: l }, height: { ideal: h } }, audio: false,
    });
  } catch (e) { return message('Accès à la caméra refusé', true); }
  apercu.srcObject = fluxCamera;
  apercu.classList.add('actif');
  await apercu.play().catch(() => {});
  webcamActive = true;
  $('webcamGo').textContent = '⏹ Arrêter la webcam';
  try { verrouEcran = await navigator.wakeLock.request('screen'); } catch (e) { /* facultatif */ }
  boucleWebcam();
}

function arreterWebcam() {
  webcamActive = false;
  if (fluxCamera) fluxCamera.getTracks().forEach((p) => p.stop());
  fluxCamera = null;
  apercu.srcObject = null;
  apercu.classList.remove('actif');
  $('webcamGo').textContent = '▶ Démarrer la webcam';
  $('webcamInfo').textContent = '';
  if (verrouEcran) verrouEcran.release().catch(() => {});
  verrouEcran = null;
}

async function boucleWebcam() {
  const toile = $('toile');
  const ctx = toile.getContext('2d');
  let images = 0, t0 = performance.now();
  while (webcamActive) {
    const debut = performance.now();
    if (!apercu.videoWidth) { await pause(50); continue; }
    if (toile.width !== apercu.videoWidth || toile.height !== apercu.videoHeight) {
      toile.width = apercu.videoWidth;
      toile.height = apercu.videoHeight;
    }
    ctx.drawImage(apercu, 0, 0);
    const image = await new Promise((ok) => toile.toBlob(ok, 'image/jpeg', 0.75));
    try {
      await api('/api/webcam', { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: image });
      images++;
    } catch (e) {
      $('webcamInfo').textContent = 'Connexion perdue, nouvelle tentative…';
      await pause(500);
      continue;
    }
    const ecoule = performance.now() - t0;
    if (ecoule > 1000) {
      const v4l2 = etat.webcam_v4l2 ? 'webcam ' + etat.webcam_v4l2 : 'flux ' + etat.url_webcam;
      $('webcamInfo').textContent = `${toile.width}×${toile.height} · ${Math.round(images * 1000 / ecoule)} images/s · ${v4l2}`;
      images = 0; t0 = performance.now();
    }
    const reste = 1000 / 25 - (performance.now() - debut);
    if (reste > 0) await pause(reste);
  }
}

$('webcamGo').addEventListener('click', () => (webcamActive ? arreterWebcam() : demarrerWebcam()));
document.addEventListener('visibilitychange', async () => {
  if (webcamActive && document.visibilityState === 'visible' && !verrouEcran) {
    try { verrouEcran = await navigator.wakeLock.request('screen'); } catch (e) { /* facultatif */ }
  }
});

// ---------- notifications ----------
$('formNotif').addEventListener('submit', (e) => {
  e.preventDefault();
  action(() => poster('/api/notification', {
    titre: $('notifTitre').value, texte: $('notifTexte').value, appli: 'Miroir',
  }), 'Notification envoyée au PC');
});

$('copierUrl').addEventListener('click', async () => {
  const texte = $('urlNotif').textContent;
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(texte); return message('Adresse copiée'); } catch (e) { /* repli */ }
  }
  const plage = document.createRange();
  plage.selectNodeContents($('urlNotif'));
  getSelection().removeAllRanges();
  getSelection().addRange(plage);
  message(document.execCommand('copy') ? 'Adresse copiée' : 'Appui long pour copier');
});

// ---------- démarrage ----------
ouvrirOnglet(location.hash.slice(1));
chargerEtat().catch(() => {});
