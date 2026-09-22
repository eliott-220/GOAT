import SwiftUI
import MapKit
import GOATCore

/// Zone de lancement du MVP : la France métropolitaine, en 3D.
enum FranceMap {
    /// Cadrage d'ouverture : toute la métropole (Corse comprise) sur un écran de téléphone en portrait,
    /// inclinée pour lire le relief. MapKit refuse les inclinaisons fortes à cette altitude
    /// (il force alors un zoom) : 45° à ~4 400 km est un bon compromis.
    static var initialCamera: MapCamera {
        MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: 46.2, longitude: 3.0),
            distance: 4_400_000, heading: 0, pitch: 45
        )
    }

    static let bounds = MapCameraBounds(
        centerCoordinateBounds: MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: 46.3, longitude: 2.3),
            span: MKCoordinateSpan(latitudeDelta: 11, longitudeDelta: 16)
        ),
        minimumDistance: 400,
        maximumDistance: 6_000_000
    )
}

struct MapScreen: View {
    @Environment(AppState.self) private var state
    @State private var position: MapCameraPosition = .camera(FranceMap.initialCamera)
    @State private var selectedProfile: ProfileRoute?
    @State private var showStartSheet = false
    @State private var showSessionSheet = false
    @State private var cameraDistance = FranceMap.initialCamera.distance

    /// À l'échelle du pays les pins de taille normale se chevauchent : on les réduit quand on est loin.
    private var pinScale: Double {
        switch cameraDistance {
        case 1_500_000...: 0.6
        case 300_000...: 0.8
        default: 1
        }
    }

    private var visiblePins: [PresencePin] {
        guard let filter = state.sportFilter else { return state.pins }
        return state.pins.filter { $0.sportIDs.contains(filter) }
    }

    var body: some View {
        map
            // L'overlay doit précéder les insets pour se placer sous la barre de filtres.
            .overlay(alignment: .topLeading) {
                circleButton(systemImage: "globe.europe.africa.fill", label: "Revoir toute la France") {
                    withAnimation { position = .camera(FranceMap.initialCamera) }
                }
                .padding(12)
            }
            .safeAreaInset(edge: .top, spacing: 0) { SportFilterBar() }
            .safeAreaInset(edge: .bottom, spacing: 0) { bottomBar }
        .sheet(item: $selectedProfile) { route in
            MiniProfileSheet(userID: route.id)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showStartSheet) {
            StartSessionSheet()
                .presentationDetents([.medium])
        }
        .sheet(isPresented: $showSessionSheet) {
            SessionSheet()
                .presentationDetents([.medium, .large])
        }
    }

    private var map: some View {
        Map(position: $position, bounds: FranceMap.bounds) {
            UserAnnotation()
            ForEach(visiblePins) { pin in
                Annotation(pin.firstName, coordinate: pin.coordinate.clCoordinate, anchor: .center) {
                    Button {
                        if pin.isMe { showSessionSheet = true } else { selectedProfile = ProfileRoute(id: pin.userID) }
                    } label: {
                        PinView(pin: pin, highlightedSport: state.sportFilter, scale: pinScale)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(pin.isMe ? "Ma position approximative" : "\(pin.firstName), \(pin.sportIDs.map(sportName).joined(separator: ", "))")
                }
            }
            .annotationTitles(.hidden)
        }
        .mapStyle(.hybrid(elevation: .realistic))
        .onMapCameraChange(frequency: .continuous) { context in
            cameraDistance = context.camera.distance
        }
        .mapControls {
            MapCompass()
            #if os(iOS)
            MapPitchToggle()
            #endif
        }
    }

    private var bottomBar: some View {
        HStack {
            circleButton(
                systemImage: state.me?.visibility.isInvisible == true ? "eye.slash.fill" : "eye.fill",
                label: state.me?.visibility.isInvisible == true ? "Invisible : toucher pour redevenir visible" : "Visible : toucher pour devenir invisible"
            ) {
                state.updateProfile { $0.visibility.isInvisible.toggle() }
            }

            Spacer(minLength: 8)
            sessionButton
            Spacer(minLength: 8)

            circleButton(systemImage: "location.fill", label: "Me localiser") {
                state.location.requestPermission()
                withAnimation { position = .userLocation(followsHeading: false, fallback: .camera(FranceMap.initialCamera)) }
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }

    @ViewBuilder private var sessionButton: some View {
        if let first = state.mySessions.first {
            Button { showSessionSheet = true } label: {
                HStack(spacing: 8) {
                    Circle().fill(Theme.live).frame(width: 10, height: 10)
                    if state.mySessions.count == 1 {
                        Text(sportName(first.sportID))
                    } else {
                        Text("\(state.mySessions.count) sessions")
                    }
                    Text(first.startedAt, style: .timer)
                        .monospacedDigit()
                        .foregroundStyle(.secondary)
                }
                .font(.headline)
                .padding(.horizontal, 18)
                .padding(.vertical, 14)
                .background(.regularMaterial, in: Capsule())
            }
            .buttonStyle(.plain)
        } else {
            Button { showStartSheet = true } label: {
                Label("Démarrer une session", systemImage: "play.fill")
                    .font(.headline)
                    .padding(.horizontal, 18)
                    .padding(.vertical, 14)
                    .foregroundStyle(.white)
                    .background(Theme.accent, in: Capsule())
                    .shadow(radius: 6, y: 2)
            }
            .buttonStyle(.plain)
        }
    }

    private func circleButton(systemImage: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.title3)
                .frame(width: 48, height: 48)
                .background(.regularMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}

struct SportFilterBar: View {
    @Environment(AppState.self) private var state

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                chip(title: "Tous", symbol: "circle.grid.2x2.fill", tint: Theme.accent, selected: state.sportFilter == nil) {
                    state.sportFilter = nil
                }
                ForEach(SportCatalog.all) { sport in
                    chip(title: sport.name, symbol: sport.symbol, tint: sport.tint, selected: state.sportFilter == sport.id) {
                        state.sportFilter = state.sportFilter == sport.id ? nil : sport.id
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 8)
        }
        .background(.ultraThinMaterial, ignoresSafeAreaEdges: .top)
    }

    private func chip(title: String, symbol: String, tint: Color, selected: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: symbol)
                .font(.subheadline.weight(.medium))
                .padding(.horizontal, 12)
                .padding(.vertical, 7)
                .background(selected ? tint : Color.secondary.opacity(0.15), in: Capsule())
                .foregroundStyle(selected ? Color.white : Color.primary)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }
}

struct PinView: View {
    let pin: PresencePin
    var highlightedSport: String?
    var scale: Double = 1

    private var sport: Sport? {
        let id = highlightedSport.flatMap { pin.sportIDs.contains($0) ? $0 : nil } ?? pin.sportIDs.first
        return id.flatMap(SportCatalog.sport(id:))
    }

    var body: some View {
        let tint = sport?.tint ?? Theme.accent
        ZStack {
            Circle().fill(tint.gradient)
            Image(systemName: sport?.symbol ?? "figure.walk")
                .font(.system(size: 15, weight: .bold))
                .foregroundStyle(.white)
        }
        .frame(width: 36, height: 36)
        .overlay(Circle().stroke(pin.isMe ? Color.white : Color.white.opacity(0.85), lineWidth: pin.isMe ? 3.5 : 2))
        .overlay(alignment: .topTrailing) {
            if pin.status == .active {
                Circle().fill(Theme.live).frame(width: 12, height: 12)
                    .overlay(Circle().stroke(.white, lineWidth: 1.5))
                    .offset(x: 3, y: -3)
            }
        }
        .overlay(alignment: .bottomTrailing) {
            if pin.sportIDs.count > 1 {
                Text("+\(pin.sportIDs.count - 1)")
                    .font(.system(size: 9, weight: .bold))
                    .padding(.horizontal, 4).padding(.vertical, 1)
                    .background(.black.opacity(0.7), in: Capsule())
                    .foregroundStyle(.white)
                    .offset(x: 4, y: 4)
            }
        }
        .opacity(pin.status == .recentlyActive || !pin.isVisibleToOthers ? 0.55 : 1)
        .shadow(color: .black.opacity(0.35), radius: 3, y: 2)
        .scaleEffect(scale)
        .animation(.easeOut(duration: 0.2), value: scale)
    }
}
