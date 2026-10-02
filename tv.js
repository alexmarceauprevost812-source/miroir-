// Page TV : affiche un code QR, attend le téléphone et affiche son flux vidéo.
const LETTRES = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const $ = (id) => document.getElementById(id);
const video = $('video');
const attente = $('attente');
const son = $('son');

function nouveauCode() {
  let c = '';
  for (let i = 0; i < 6; i++) c += LETTRES[Math.floor(Math.random() * LETTRES.length)];
  return c;
}

let appelCourant = null;

function afficherAttente() {
  video.hidden = true;
  son.hidden = true;
  video.srcObject = null;
  attente.hidden = false;
  $('etat').textContent = 'En attente du téléphone…';
}

function afficherFlux(flux) {
  video.srcObject = flux;
  video.muted = true;
  video.hidden = false;
  attente.hidden = true;
  son.hidden = flux.getAudioTracks().length === 0;
  video.play().catch(() => {});
}

son.addEventListener('click', () => {
  video.muted = false;
  son.hidden = true;
});

function demarrer() {
  // Un QR vers file:// est inutilisable par le téléphone : il faut une adresse web.
  if (location.protocol === 'file:') {
    $('qr').hidden = true;
    $('etat').textContent = 'Ouvrez cette page par une adresse web (GitHub Pages, ou « miroir tv --https » sur le PC) : '
      + 'le téléphone ne peut pas lire un fichier local.';
    return;
  }
  const code = nouveauCode();
  const peer = new Peer(PREFIXE + code, optionsPeer());

  peer.on('open', () => {
    const url = new URL('envoyer.html', location.href);
    url.searchParams.set('code', code);
    const signal = new URLSearchParams(location.search).get('signal');
    if (signal) url.searchParams.set('signal', signal);
    $('code').textContent = code;
    $('lien').textContent = url.href;
    $('qr').innerHTML = '';
    new QRCode($('qr'), { text: url.href, width: 280, height: 280, correctLevel: QRCode.CorrectLevel.M });
    $('etat').textContent = 'En attente du téléphone…';
  });

  peer.on('call', (appel) => {
    if (appelCourant) appelCourant.close();
    appelCourant = appel;
    appel.answer();
    appel.on('stream', afficherFlux);
    appel.on('close', () => { if (appelCourant === appel) { appelCourant = null; afficherAttente(); } });
    appel.on('error', () => { if (appelCourant === appel) { appelCourant = null; afficherAttente(); } });
  });

  peer.on('connection', recevoirFichiers);

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') { peer.destroy(); demarrer(); return; }
    $('etat').textContent = 'Erreur : ' + err.type + ' — nouvelle tentative…';
  });

  peer.on('disconnected', () => peer.reconnect());
}

// --- Réception de fichiers ---
const recus = [];
let indexAffiche = -1;

function taille(o) {
  if (o < 1048576) return (o / 1024).toFixed(0) + ' Ko';
  if (o < 1073741824) return (o / 1048576).toFixed(1) + ' Mo';
  return (o / 1073741824).toFixed(2) + ' Go';
}

// Limites pour ne pas saturer la mémoire d'une TV : taille par fichier, et les plus
// anciens fichiers reçus sont oubliés au-delà d'un total ou d'un nombre.
const TAILLE_MAX_FICHIER = 512 * 1024 * 1024;
const TAILLE_MAX_TOTALE = 1024 * 1024 * 1024;
const NOMBRE_MAX_FICHIERS = 30;
// Octets annoncés par les réceptions en cours, tous téléphones confondus : ils comptent
// dans la limite totale dès le début de l'envoi, pas seulement une fois le fichier reçu.
let octetsReserves = 0;

function recevoirFichiers(conn) {
  const enCours = {};
  const liberer = (id) => {
    if (!enCours[id]) return;
    octetsReserves -= enCours[id].taille;
    delete enCours[id];
  };
  const refuser = (id, raison) => {
    liberer(id);
    $('reception').hidden = true;
    conn.send({ t: 'refus', id, raison });
  };
  conn.on('data', (m) => {
    if (!m || !m.t) return;
    if (m.t === 'debut') {
      if (!(m.taille >= 0) || m.taille > TAILLE_MAX_FICHIER) {
        return refuser(m.id, 'fichier trop gros pour la TV (max ' + taille(TAILLE_MAX_FICHIER) + ')');
      }
      if (enCours[m.id]) return refuser(m.id, 'envoi déjà en cours');
      if (octetsReserves + m.taille > TAILLE_MAX_TOTALE) {
        return refuser(m.id, 'TV occupée par d\'autres envois, réessayez plus tard');
      }
      octetsReserves += m.taille;
      enCours[m.id] = { nom: m.nom, mime: m.mime, taille: m.taille, morceaux: [], recu: 0 };
      oublierAnciens(0);
    } else if (m.t === 'morceau' && enCours[m.id]) {
      const f = enCours[m.id];
      if (f.recu + m.d.byteLength > f.taille) return refuser(m.id, 'taille annoncée dépassée');
      f.morceaux.push(m.d);
      f.recu += m.d.byteLength;
      const pct = f.taille ? Math.round((f.recu / f.taille) * 100) : 100;
      $('reception').hidden = false;
      $('reception').textContent = '⬇ ' + f.nom + ' — ' + pct + ' %';
    } else if (m.t === 'fin' && enCours[m.id]) {
      const f = enCours[m.id];
      liberer(m.id);
      $('reception').hidden = true;
      if (f.recu !== f.taille) return conn.send({ t: 'refus', id: m.id, raison: 'fichier incomplet' });
      ajouterRecu(new Blob(f.morceaux, { type: f.mime || 'application/octet-stream' }), f.nom);
      // Accusé de réception : le téléphone n'annonce le succès qu'après ce message.
      conn.send({ t: 'recu', id: m.id });
    }
  });
  conn.on('close', () => {
    for (const id of Object.keys(enCours)) liberer(id);
    $('reception').hidden = true;
  });
}

function ajouterRecu(blob, nom) {
  const fichier = { nom, blob, type: blob.type, url: URL.createObjectURL(blob), taille: blob.size };
  recus.push(fichier);
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.textContent = nom + ' (' + taille(blob.size) + ')';
  b.addEventListener('click', () => afficherFichier(recus.indexOf(fichier)));
  li.appendChild(b);
  fichier.li = li;
  $('listeRecus').prepend(li);
  $('recus').hidden = false;
  oublierAnciens();
  afficherFichier(recus.indexOf(fichier));
}

// Libère la mémoire des fichiers les plus anciens au-delà des limites (réceptions en
// cours comprises). « garder » : nombre de fichiers récents à conserver quoi qu'il arrive.
function oublierAnciens(garder = 1) {
  let total = recus.reduce((t, f) => t + f.taille, 0);
  while (recus.length > garder
         && (recus.length > NOMBRE_MAX_FICHIERS || total + octetsReserves > TAILLE_MAX_TOTALE)) {
    const ancien = recus.shift();
    total -= ancien.taille;
    if (indexAffiche === 0) fermerVisionneuse();
    indexAffiche--;
    ancien.li.remove();
    URL.revokeObjectURL(ancien.url);
  }
}

function afficherFichier(i) {
  const f = recus[i];
  if (!f) return;
  indexAffiche = i;
  const contenu = $('contenu');
  contenu.innerHTML = '';
  const type = f.type;
  let el;
  if (type.startsWith('image/')) {
    el = document.createElement('img');
    el.src = f.url;
  } else if (type.startsWith('video/') || type.startsWith('audio/')) {
    el = document.createElement(type.startsWith('video/') ? 'video' : 'audio');
    el.src = f.url;
    el.controls = true;
    el.autoplay = true;
    el.playsInline = true;
  } else if (type === 'application/pdf') {
    // Le Blob a le type PDF : le navigateur l'ouvre avec sa visionneuse PDF, jamais comme du HTML.
    el = document.createElement('iframe');
    el.src = f.url;
  } else if (type.startsWith('text/') || type === 'application/json') {
    // Texte (y compris HTML ou SVG) affiché tel quel, jamais interprété : aucun script ne s'exécute.
    el = document.createElement('pre');
    f.blob.slice(0, 1 << 20).text().then((t) => { el.textContent = t; });
  } else {
    el = document.createElement('div');
    el.className = 'autre';
    el.textContent = '📄 ' + f.nom + ' — ' + taille(f.taille) + ' (aperçu impossible, utilisez « Télécharger »)';
  }
  contenu.appendChild(el);
  $('titre').textContent = f.nom + '  (' + (i + 1) + '/' + recus.length + ')';
  $('telecharger').href = f.url;
  $('telecharger').download = f.nom;
  $('visionneuse').hidden = false;
  $('fermer').focus();
}

function fermerVisionneuse() {
  $('visionneuse').hidden = true;
  $('contenu').innerHTML = '';
}

$('fermer').addEventListener('click', fermerVisionneuse);
$('precedent').addEventListener('click', () => afficherFichier((indexAffiche - 1 + recus.length) % recus.length));
$('suivant').addEventListener('click', () => afficherFichier((indexAffiche + 1) % recus.length));
document.addEventListener('keydown', (e) => {
  if ($('visionneuse').hidden) return;
  if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack') fermerVisionneuse();
});

demarrer();
