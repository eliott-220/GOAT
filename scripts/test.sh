#!/bin/sh
# Lance les tests du package.
# Avec Xcode installé, `swift test` suffit. Avec les seuls Command Line Tools, Swift Testing n'est pas
# trouvé automatiquement : on lui indique son framework et on désactive l'overlay Foundation manquant.
# Ce dernier flag casse MapKit/PhotosUI (overlays SwiftUI), donc on ne construit QUE le bundle de tests
# (GOATCore) puis on l'exécute avec --skip-build ; GOATUI est vérifié par `swift build`.
set -e
cd "$(dirname "$0")/.."
if [ "$(xcode-select -p)" != "/Library/Developer/CommandLineTools" ]; then
  exec swift test "$@"
fi
CLT=/Library/Developer/CommandLineTools/Library/Developer/Frameworks
swift build --product GOATKitPackageTests \
  -Xswiftc -F -Xswiftc "$CLT" -Xswiftc -Xfrontend -Xswiftc -disable-cross-import-overlays \
  -Xlinker -F -Xlinker "$CLT" -Xlinker -rpath -Xlinker "$CLT"
exec swift test --skip-build \
  -Xlinker -F -Xlinker "$CLT" -Xlinker -rpath -Xlinker "$CLT" "$@"
