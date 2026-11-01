#!/usr/bin/env bash
# Build android/AeroCat.apk without Gradle:  aapt2 -> javac -> dx -> zipalign -> apksigner
#
# Needs (Ubuntu / Debian / WSL):
#   sudo apt install aapt apksigner zipalign android-sdk-platform-23 dalvik-exchange default-jdk-headless zip python3
#
# Signing: uses android/aerocat.jks (created on first run if missing; never commit it).
# Override with AEROCAT_KEYSTORE, AEROCAT_KEYSTORE_PASS and AEROCAT_KEY_ALIAS.
set -euo pipefail
cd "$(dirname "$0")"

PLATFORM="${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}"
KEYSTORE="${AEROCAT_KEYSTORE:-aerocat.jks}"
KS_PASS="${AEROCAT_KEYSTORE_PASS:-aerocat-pass}"
KS_ALIAS="${AEROCAT_KEY_ALIAS:-aerocat}"
OUT=AeroCat.apk
B=build

for tool in aapt2 javac dalvik-exchange zipalign apksigner keytool zip python3; do
  command -v "$tool" >/dev/null || { echo "Missing tool: $tool (see README: Building the APK)"; exit 1; }
done
[ -f "$PLATFORM" ] || { echo "android.jar not found at $PLATFORM (install android-sdk-platform-23 or set ANDROID_JAR)"; exit 1; }

rm -rf "$B"
mkdir -p "$B"/{compiled,gen,classes,dex} assets

# 0. the game itself: one self-contained HTML file
python3 ../game/build.py
cp ../docs/index.html assets/index.html

# 1. resources + manifest
aapt2 compile --dir res -o "$B/compiled/res.zip"
aapt2 link -I "$PLATFORM" --manifest AndroidManifest.xml -A assets \
  --java "$B/gen" -o "$B/unsigned.apk" "$B/compiled/res.zip"

# 2. Java -> .class -> classes.dex
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 \
  -bootclasspath "$PLATFORM" -classpath "$PLATFORM" -d "$B/classes" \
  $(find src "$B/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=21 --output="$B/dex/classes.dex" "$B/classes"
(cd "$B/dex" && zip -q -X ../unsigned.apk classes.dex)

# 3. align + sign (v1 + v2 + v3)
zipalign -f -p 4 "$B/unsigned.apk" "$B/aligned.apk"
if [ ! -f "$KEYSTORE" ]; then
  echo "No keystore found: creating $KEYSTORE (keep it safe, every update must be signed with it)"
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=AERO.CAT" >/dev/null 2>&1
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --key-pass "pass:$KS_PASS" --ks-key-alias "$KS_ALIAS" \
  --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \
  --out "$OUT" "$B/aligned.apk"
apksigner verify "$OUT"
echo "Built android/$OUT ($(du -k "$OUT" | cut -f1) KB)"
