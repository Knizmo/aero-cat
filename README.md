# AERO.CAT

**A doodle-powered space flight.** Fly the AERO.CAT rocket (kitten on board) from the garden up into space. Grab stars to keep the engine running, dodge comets, and bring stardust home to grow your garden.

Every sprite in the game was cut straight out of one page of ballpoint-pen doodles.

<p align="center">
  <img src="screenshots/title.png" width="200" alt="Title screen with the garden">
  <img src="screenshots/play.png" width="200" alt="Dodging comets and grabbing stars">
  <img src="screenshots/powerups.png" width="200" alt="Galaxy warp and cat planet shield">
  <img src="screenshots/gameover.png" width="200" alt="The garden grows after a flight">
</p>

## Play

- **Android:** download `AeroCat.apk` from the latest run on the [Actions](../../actions) tab (or from Releases, if you publish one). Open it on your phone and allow installs from that app. Works on Android 5.0 and newer.
- **Browser:** [`docs/index.html`](docs/index.html) is the whole game in one file; open it in any browser. To play it online, turn on GitHub Pages (**Settings → Pages → Deploy from a branch → `main` / `/docs`**). The game will then be at `https://<your-username>.github.io/<repo-name>/`.

## How to play

| | |
|---|---|
| **Steer** | Drag anywhere on the screen. Keyboard: ← → or A / D, and P or Esc to pause |
| **Stars** ✦ | They're your stardust fuel. If you run dry, the engine sputters out |
| **Comets** ☄ | Dodge them. A red **!** shows where the next one is coming from |
| **Galaxy** 🌀 | Fly into the swirl for a warp boost |
| **Cat planet** 🪐 | Touch it for a cat-bubble shield that blocks one hit |
| **Garden** 🌼 | Stars you bring home grow the garden, and each stage unlocks a perk |

Garden stages: 40 ★ sprout (fuel tank +25%) · 120 ★ daisy (start every flight with a shield) · 250 ★ young tree (star magnet) · 450 ★ tall tree (longer warp) · 750 ★ star-fruit tree (+50% fuel per star) · 1200 ★ starlit garden (big stars are worth double).

## From doodle to game

<p align="center"><img src="screenshots/original-page.jpg" width="560" alt="The original page of doodles"></p>

`tools/make_sprites.py` turns the photo (`art/original-drawing.jpg`) into the sprites:

1. It turns the page upright and evens out the lighting of the photo.
2. It keeps only the dark ballpoint ink. The printed grid and old pencil marks are lighter, so they drop out.
3. It assigns every stroke to one of the drawings.
4. It fills each drawing with paper white so it reads as a cut-out, adds a light highlighter tint, then crops, rotates and scales it.

Lossless masters go to `art/sprites/`, the WebP files the game uses go to `game/assets/`, and anchor points go to `art/sprites/meta.json`. The AERO.CAT logo is the lettering from the rocket itself.

## Project layout

```
game/
  src/              index.html, style.css, game.js  (the whole game: plain JavaScript + canvas)
  assets/           sprites (WebP)
  font/             Patrick Hand font + its licence
  build.py          bundles everything into docs/index.html
docs/index.html     the built game, one self-contained file (also served by GitHub Pages)
android/            WebView wrapper app + build.sh (no Gradle)
art/                the original photo + lossless sprite masters
tools/              sprite and icon pipelines (Python)
.github/workflows/  build.yml builds the APK on every push
```

## Building

### Web

```bash
python3 game/build.py        # -> docs/index.html  (Python 3 only, no packages needed)
```

Commit the rebuilt `docs/index.html` together with your changes so GitHub Pages serves the latest version.

### Android APK

The app is a full-screen WebView that loads the game from its assets. It saves progress to SharedPreferences, vibrates on hits, pauses when it goes to the background, and handles the Back button. It is built without Gradle (aapt2 → javac → dx → zipalign → apksigner), using Ubuntu packages:

```bash
sudo apt install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange default-jdk-headless zip python3
bash android/build.sh        # -> android/AeroCat.apk
```

On Windows, run this inside WSL (Ubuntu). Or let GitHub build it: every push to `main` runs `.github/workflows/build.yml`, and the APK appears under that run's **Artifacts**.

### Signing

The signing key is never committed (`*.jks` is in `.gitignore`). `build.sh` signs with `android/aerocat.jks` and creates it on the first build (default password `aerocat-pass`; set `AEROCAT_KEYSTORE_PASS` before the first build to pick your own). Keep that file safe and backed up. Android only installs an update over an existing install if both are signed with the same key.

To sign the GitHub builds with your key, add two repository secrets (**Settings → Secrets and variables → Actions**):

- `KEYSTORE_BASE64`: the output of `base64 -w0 android/aerocat.jks`
- `KEYSTORE_PASSWORD`: the keystore password

Without them, each GitHub build is signed with a new throwaway key. That's fine for testing, but you'll have to uninstall the previous version before installing a new one.

### Sprites and icons

```bash
pip install -r tools/requirements.txt
python3 tools/make_sprites.py   # photo -> art/sprites/*.png + game/assets/*.webp
python3 tools/make_icons.py     # -> android/res launcher icons
```

## Credits

- Drawings: ballpoint pen on French-ruled notebook paper.
- Font: [Patrick Hand](https://fonts.google.com/specimen/Patrick+Hand) by Patrick Wagesreiter, SIL Open Font License 1.1 (`game/font/OFL.txt`).
- Music and sound effects are synthesized live with the Web Audio API.
