# Miroir

Afficher l'écran du téléphone sur la TV et partager des fichiers (photos, vidéos,
documents…) en **scannant un code QR**. Aucun compte, aucune appli à installer.

## 1. Sur la TV (navigateur web)

1. Ouvrez la page `index.html` **par une adresse web** dans le navigateur de la TV
   (GitHub Pages, ou `miroir tv --https` sur le PC). Un fichier ouvert directement
   (`file://`) ne marche pas : le téléphone ne peut pas y accéder.
2. Un **code QR** et un code à 6 lettres s'affichent.
3. Scannez le QR avec le téléphone : la page `envoyer.html` s'ouvre, déjà reliée à la TV.

Depuis le téléphone vous pouvez :

| Bouton | Ce qui s'affiche sur la TV |
| --- | --- |
| 📱 Partager mon écran | l'écran en direct (voir limites ci-dessous) |
| 📷 Partager la caméra | la caméra arrière en direct |
| 📁 Envoyer des fichiers | photos, vidéos, musique, PDF, texte… ; les autres types peuvent être téléchargés sur la TV |

Sur la TV, les fichiers reçus apparaissent dans « Fichiers reçus » ; ◀ ▶ pour
naviguer, « Télécharger » pour les garder, Échap / Retour pour fermer.

La connexion est directe entre le téléphone et la TV (WebRTC). Le serveur public
PeerJS sert uniquement à les mettre en relation. Pour utiliser votre propre serveur :
`index.html?signal=https://mon-serveur:9000/miroir`.

### Mise en ligne

Le partage d'écran et la caméra exigent **HTTPS**. Le plus simple : activer
GitHub Pages sur ce dépôt (Settings → Pages → branche), puis ouvrir
`https://<utilisateur>.github.io/miroir-/` sur la TV.

### Limites

- **Partage d'écran du téléphone** : Android (Chrome) et iPhone (Safari) ne
  permettent pas encore à une page web de capturer l'écran. Le bouton est alors
  grisé ; utilisez l'envoi de fichiers / la caméra, ou la fonction intégrée du
  téléphone (Smart View, Cast, AirPlay). Sur ordinateur, le partage d'écran marche.
- Téléphone et TV doivent avoir accès à Internet (mise en relation).

## 2. Outil Linux en terminal : `miroir`

Affiche un code QR **directement dans le terminal**. Fonctionne sur le Wi-Fi local,
sans Internet. Python 3 suffit ; pour voir le QR : `sudo apt install qrencode`
(ou `pip install qrcode`).

```bash
chmod +x miroir
sudo ln -s "$PWD/miroir" /usr/local/bin/miroir   # optionnel
```

### `miroir hub` : le téléphone devient le compagnon du PC

```bash
miroir hub                                  # puis scannez le QR avec le téléphone
miroir hub photo.jpg appli.apk Documents/   # + fichiers proposés au téléphone
```

Une page s'ouvre sur le téléphone, avec le logo MIROIR rouge en 3D et 5 onglets :

| Onglet | Fonction | Outil nécessaire sur le PC |
| --- | --- | --- |
| 📁 Fichiers | téléphone → PC (photos, APK, documents ; reçus dans `~/Téléchargements/miroir`) et PC → téléphone (fichiers donnés à `miroir hub`) | — |
| 📋 Texte | presse-papiers partagé (copier sur l'un, coller sur l'autre), ouvrir un lien sur le PC, afficher un texte | `xclip` (X11) ou `wl-clipboard` (Wayland) |
| 🖱️ Contrôle | pavé tactile (souris, clic, défilement à 2 doigts), clavier, volume, ⏮ ⏯ ⏭, diapositives (◀ ▶, F5, écran noir) | `xdotool` (X11) ou `ydotool` (Wayland) ; volume : `wpctl`, `pactl` ou `amixer` |
| 📷 Webcam | la caméra du téléphone devient la webcam du PC | `miroir webcam` (HTTPS) ; `ffmpeg` + `v4l2loopback` |
| 🔔 Notifs | notifications du téléphone sur le bureau Linux | `libnotify-bin` (`notify-send`) |

Au démarrage, le terminal indique ce qui est disponible et ce qu'il faut installer :

```bash
sudo apt install qrencode xclip xdotool libnotify-bin ffmpeg v4l2loopback-dkms
```

**Connexion par QR, sans mot de passe** : le QR contient une clé secrète aléatoire
(`~/.config/miroir/jeton`). Le téléphone qui l'a scanné reste connecté 30 jours ;
sans la clé, tout est refusé. `miroir hub --nouveau-jeton` change la clé et
déconnecte tous les téléphones. En HTTP, la clé circule en clair sur le Wi-Fi :
utilisez `--https` sur un réseau que vous ne maîtrisez pas.

**Webcam** :

```bash
sudo modprobe v4l2loopback exclusive_caps=1 card_label="Miroir"   # une fois
miroir webcam        # HTTPS : acceptez l'avertissement du certificat sur le téléphone
```

**Faire confiance au HTTPS (une seule fois)** : `miroir` crée une autorité locale
« Miroir » (`~/.config/miroir/ca.pem`) et un certificat pour l'adresse IP du PC,
refait automatiquement si l'IP change. Sans elle, il faut accepter un avertissement
à chaque fois, et certains navigateurs refusent alors la caméra. Ouvrez
`https://IP-DU-PC:8443/miroir-ca.crt` sur le téléphone (lien aussi dans l'onglet
📷), puis :

- **Android** : Paramètres → Sécurité → Chiffrement et identifiants → Installer un
  certificat → Certificat CA → choisir `miroir-ca.crt`.
- **iPhone** (dans Safari) : Réglages → Profil téléchargé → Installer, puis Réglages →
  Général → Informations → Réglages des certificats → activer « Miroir ».

Vérifiez que l'empreinte affichée dans le terminal correspond. Ne partagez jamais
`~/.config/miroir/ca-cle.pem`.

La caméra apparaît comme webcam dans Zoom, Meet, OBS… Sans v4l2loopback, l'image
reste visible sur `https://localhost:8443/webcam` (utilisable comme source dans OBS).

**Notifications du téléphone** : un navigateur ne peut pas lire les notifications
d'Android. L'onglet 🔔 donne une adresse à utiliser dans MacroDroid, Tasker ou
Automate : déclencheur « Notification reçue », puis action « Requête HTTP POST »
avec le corps `{"appli":"…","titre":"…","texte":"…"}`. Pour une intégration complète
(SMS, appels, batterie), KDE Connect / GSConnect reste l'outil de référence.

### Partage simple de fichiers

```bash
miroir envoyer photo.jpg film.mp4 Documents/   # Linux -> téléphone
miroir recevoir -d ~/Images                    # téléphone -> Linux
```

### `miroir wifi` : connecter un invité sans taper le mot de passe

```bash
miroir wifi                                  # Wi-Fi actuel (NetworkManager)
miroir wifi --ssid MaBox --mdp 'motdepasse'  # réseau choisi
miroir wifi -o wifi.png                      # image à imprimer
```

Le QR suit le format standard `WIFI:T:WPA;S:nom;P:motdepasse;;`. L'invité le scanne
avec l'appareil photo (Android et iPhone) et se connecte directement.

### `miroir qr` : générateur de codes QR

```bash
miroir qr lien exemple.com
miroir qr texte "Code de la porte : 1234"
miroir qr contact --nom "Alex Martin" --tel "+33 6 12 34 56 78" --email alex@exemple.fr -o carte.png
miroir qr wifi --ssid Invités --securite aucune
```

Ajoutez `-o fichier.png` ou `-o fichier.svg` pour enregistrer une image.

### `miroir tv`

Sert l'écran TV de Miroir (partie 1) depuis ce PC et ouvre le navigateur.
En HTTP le téléphone peut seulement envoyer des fichiers ; `miroir tv --https`
active la caméra et le partage d'écran (certificat auto-signé à accepter).
`Ctrl+C` arrête chaque commande ; `-p PORT` change le port.

## Fichiers

- `index.html`, `tv.js` – écran TV (QR, affichage du flux et des fichiers)
- `envoyer.html`, `envoyer.js` – page téléphone de l'écran TV
- `commun.js`, `style.css` – partagés
- `lib/` – PeerJS 1.5.4 et qrcodejs 1.0.0 (licence MIT)
- `miroir` – outil Linux en ligne de commande
- `pc/` – page téléphone du hub (`miroir hub`)
