# Miroir

Afficher l'écran du téléphone sur la TV et partager des fichiers (photos, vidéos,
documents…) en **scannant un code QR**. Aucun compte, aucune appli à installer.

## 1. Sur la TV (navigateur web)

1. Ouvrez `index.html` dans le navigateur de la TV (ou d'un PC branché à la TV).
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
sans Internet. Python 3 suffit ; pour le QR : `sudo apt install qrencode`
(ou `pip install qrcode`).

```bash
chmod +x miroir
sudo ln -s "$PWD/miroir" /usr/local/bin/miroir   # optionnel

miroir envoyer photo.jpg film.mp4 Documents/   # Linux -> téléphone
miroir recevoir                                # téléphone -> Linux (~/Téléchargements/miroir)
miroir recevoir -d ~/Images                    # choisir le dossier
miroir tv                                      # sert l'écran TV de Miroir depuis ce PC
```

Scannez le QR affiché avec le téléphone, puis téléchargez ou envoyez les fichiers.
`Ctrl+C` arrête le partage. Option `-p PORT` pour changer de port (8080 par défaut).

## Fichiers

- `index.html`, `tv.js` – écran TV (QR, affichage du flux et des fichiers)
- `envoyer.html`, `envoyer.js` – page téléphone
- `commun.js`, `style.css` – partagés
- `lib/` – PeerJS 1.5.4 et qrcodejs 1.0.0 (licence MIT)
- `miroir` – outil Linux en ligne de commande
