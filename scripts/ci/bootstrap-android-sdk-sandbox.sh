#!/usr/bin/env bash
# Csak korlátozott hálózatú build-környezethez (pl. felhős sandbox, ahol a
# dl.google.com nem érhető el). Normál fejlesztéshez az Android Studio SDK
# Managerét használd – lásd README.md.
#
# Összerak egy minimális, fordításra alkalmas Android SDK-t:
#  - platforms/android-36: android.jar a Robolectric android-all (Maven Central)
#    keretrendszer-osztályaiból + erőforrásaiból, a java.* osztályok a helyi JDK-ból
#  - build-tools/36.0.0: az Ubuntu android-sdk-build-tools csomag binárisai
#  - aapt2-t az Android Gradle Plugin úgyis a maven.google.com-ról tölti.
# Az így készült APK működőképes (a futásidejű keretrendszer a telefoné), de
# hivatalos release-hez a Google SDK-t ajánljuk.
set -euo pipefail

SDK="${ANDROID_HOME:-/opt/android-sdk}"
API=36
BT=36.0.0
AA_VER="16-robolectric-13921718"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [ ! -d /usr/lib/android-sdk/build-tools ]; then
  apt-get update -qq
  DEBIAN_FRONTEND=noninteractive apt-get install -y -qq android-sdk android-sdk-build-tools android-sdk-platform-23
fi
JAVA_HOME="${JAVA_HOME:-$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")}"

mkdir -p "$SDK/platforms/android-$API" "$SDK/build-tools/$BT" "$SDK/licenses"
cp -r /usr/lib/android-sdk/platform-tools "$SDK/" 2>/dev/null || true

echo ">> android-all $AA_VER letöltése"
curl -sSfL -o "$WORK/aa.jar" \
  "https://repo1.maven.org/maven2/org/robolectric/android-all/$AA_VER/android-all-$AA_VER.jar"

mkdir -p "$WORK/plat" "$WORK/core"
( cd "$WORK/plat" && unzip -q "$WORK/aa.jar" \
    'android/*' 'dalvik/*' 'javax/*' 'org/json/*' 'org/w3c/*' 'org/xml/*' 'org/xmlpull/*' \
    'org/apache/http/*' 'res/*' 'resources.arsc' 'AndroidManifest.xml' -x '*.uau' -x '*_compat_config.xml' )

echo ">> java.* osztályok a JDK-ból"
for m in java.base java.logging java.sql java.xml; do
  "$JAVA_HOME/bin/jmod" extract --dir "$WORK/jm_$m" "$JAVA_HOME/jmods/$m.jmod"
  rm -f "$WORK/jm_$m/classes/module-info.class"
  cp -rn "$WORK/jm_$m/classes/." "$WORK/plat/"
done
cp -r "$WORK/jm_java.base/classes/." "$WORK/core/"

( cd "$WORK/plat" && zip -qr -X "$SDK/platforms/android-$API/android.jar" . )
( cd "$WORK/core" && zip -qr -X "$SDK/platforms/android-$API/core-for-system-modules.jar" . )
unzip -p "$WORK/aa.jar" build.prop > "$SDK/platforms/android-$API/build.prop"
cp /usr/lib/android-sdk/platforms/android-23/framework.aidl "$SDK/platforms/android-$API/"
cp -r /usr/lib/android-sdk/platforms/android-23/data "$SDK/platforms/android-$API/" 2>/dev/null || true

cat > "$SDK/platforms/android-$API/source.properties" <<P
Pkg.Desc=Android SDK Platform $API
Pkg.UserSrc=false
Platform.Version=16
Platform.CodeName=
Pkg.Revision=1
AndroidVersion.ApiLevel=$API
Layoutlib.Api=15
Layoutlib.Revision=1
Platform.MinToolsRev=22
P
cat > "$SDK/platforms/android-$API/package.xml" <<P
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<ns2:repository xmlns:ns2="http://schemas.android.com/repository/android/common/01"
                xmlns:ns3="http://schemas.android.com/sdk/android/repo/addon2/01"
                xmlns:ns4="http://schemas.android.com/sdk/android/repo/sys-img2/01"
                xmlns:ns5="http://schemas.android.com/repository/android/generic/01"
                xmlns:ns6="http://schemas.android.com/sdk/android/repo/repository2/01">
  <license id="apache-2.0" type="text">Please refer to Apache v2.0 license</license>
  <localPackage path="platforms;android-$API" obsolete="false">
    <type-details xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="ns6:platformDetailsType">
      <api-level>$API</api-level>
      <layoutlib api="15"/>
    </type-details>
    <revision><major>1</major></revision>
    <display-name>Android SDK Platform $API (sandbox)</display-name>
    <uses-license ref="apache-2.0"/>
  </localPackage>
</ns2:repository>
P

echo ">> build-tools $BT"
cp -a /usr/lib/android-sdk/build-tools/29.0.3/. "$SDK/build-tools/$BT/"
ln -sf /usr/share/java/apksigner.jar "$SDK/build-tools/$BT/apksigner.jar"
mkdir -p "$SDK/build-tools/$BT/lib"
ln -sf /usr/share/java/apksigner.jar "$SDK/build-tools/$BT/lib/apksigner.jar"
cat > "$SDK/build-tools/$BT/source.properties" <<P
Pkg.Desc=Android SDK Build-Tools $BT
Pkg.Revision=$BT
P
sed -e "s/build-tools;29.0.3/build-tools;$BT/" -e "s/<major>29/<major>${BT%%.*}/" -e "s/<micro>3/<micro>0/" \
  -e "s/Build-Tools 29.0.3/Build-Tools $BT/" /usr/lib/android-sdk/build-tools/29.0.3/package.xml \
  > "$SDK/build-tools/$BT/package.xml"

echo ">> kész: $SDK"
