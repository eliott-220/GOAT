import CoreLocation
import GOATCore
import Observation

/// Enveloppe de CoreLocation pensée pour la batterie :
/// - précision réduite (la position diffusée est de toute façon arrondie à ~150 m) ;
/// - uniquement au premier plan, jamais de suivi en tâche de fond ;
/// - démarrée à l'ouverture de la première session, coupée à la fin de la dernière.
@MainActor @Observable
public final class LocationProvider: NSObject, CLLocationManagerDelegate {
    public private(set) var authorization: CLAuthorizationStatus
    public private(set) var lastCoordinate: GeoCoordinate?

    @ObservationIgnored private let manager = CLLocationManager()

    public override init() {
        authorization = manager.authorizationStatus
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.distanceFilter = 25
    }

    public var isAuthorized: Bool {
        #if os(iOS)
        authorization == .authorizedWhenInUse || authorization == .authorizedAlways
        #else
        authorization == .authorizedAlways
        #endif
    }

    public var isDenied: Bool {
        authorization == .denied || authorization == .restricted
    }

    public func requestPermission() {
        guard authorization == .notDetermined else { return }
        manager.requestWhenInUseAuthorization()
    }

    public func start() {
        guard isAuthorized else { return }
        manager.startUpdatingLocation()
    }

    public func stop() {
        manager.stopUpdatingLocation()
        lastCoordinate = nil // ne jamais réutiliser une position périmée à la session suivante
    }

    #if DEBUG
    /// Point d'injection pour les tests et les démos : simule une autorisation et une position.
    func simulate(authorization: CLAuthorizationStatus, coordinate: GeoCoordinate?) {
        self.authorization = authorization
        lastCoordinate = coordinate
    }
    #endif

    // MARK: CLLocationManagerDelegate

    public nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        let status = manager.authorizationStatus
        Task { @MainActor in self.authorization = status }
    }

    public nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let latest = locations.last else { return }
        let coordinate = GeoCoordinate(latitude: latest.coordinate.latitude, longitude: latest.coordinate.longitude)
        Task { @MainActor in self.lastCoordinate = coordinate }
    }

    public nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Erreur transitoire (ex. position indisponible) : on garde la dernière position connue.
    }
}
