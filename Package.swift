// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "GOATKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "GOATCore", targets: ["GOATCore"]),
        .library(name: "GOATUI", targets: ["GOATUI"]),
    ],
    targets: [
        // Modèles, règles métier, backend (protocole + implémentation en mémoire). Aucune dépendance UI.
        .target(name: "GOATCore"),
        // Écrans SwiftUI, état applicatif, localisation.
        .target(name: "GOATUI", dependencies: ["GOATCore"]),
        .testTarget(name: "GOATCoreTests", dependencies: ["GOATCore"]),
    ]
)
