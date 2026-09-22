import Foundation

public struct GeoCoordinate: Hashable, Codable, Sendable {
    public var latitude: Double
    public var longitude: Double

    public init(latitude: Double, longitude: Double) {
        self.latitude = latitude
        self.longitude = longitude
    }

    /// Distance en mètres (formule de haversine).
    public func distance(to other: GeoCoordinate) -> Double {
        let r = 6_371_000.0
        let dLat = (other.latitude - latitude) * .pi / 180
        let dLon = (other.longitude - longitude) * .pi / 180
        let a = sin(dLat / 2) * sin(dLat / 2)
            + cos(latitude * .pi / 180) * cos(other.latitude * .pi / 180) * sin(dLon / 2) * sin(dLon / 2)
        return 2 * r * asin(min(1, sqrt(a)))
    }
}

public enum Geohash {
    private static let alphabet = Array("0123456789bcdefghjkmnpqrstuvwxyz")
    private static let indexOf: [Character: Int] =
        Dictionary(uniqueKeysWithValues: alphabet.enumerated().map { ($1, $0) })

    /// Précision utilisée pour toute position diffusée aux autres utilisateurs :
    /// cellule d'environ 150 m × 150 m (spec MVP : arrondi ~200 m).
    public static let publicPrecision = 7

    public static func encode(latitude: Double, longitude: Double, precision: Int = publicPrecision) -> String {
        var lat = (min: -90.0, max: 90.0)
        var lon = (min: -180.0, max: 180.0)
        var hash = ""
        var bit = 0
        var value = 0
        var isLongitudeBit = true

        while hash.count < precision {
            if isLongitudeBit {
                let mid = (lon.min + lon.max) / 2
                if longitude >= mid { value = value << 1 | 1; lon.min = mid } else { value <<= 1; lon.max = mid }
            } else {
                let mid = (lat.min + lat.max) / 2
                if latitude >= mid { value = value << 1 | 1; lat.min = mid } else { value <<= 1; lat.max = mid }
            }
            isLongitudeBit.toggle()
            bit += 1
            if bit == 5 {
                hash.append(alphabet[value])
                bit = 0
                value = 0
            }
        }
        return hash
    }

    /// Centre de la cellule. Nil si le hash contient un caractère invalide.
    public static func decode(_ hash: String) -> GeoCoordinate? {
        var lat = (min: -90.0, max: 90.0)
        var lon = (min: -180.0, max: 180.0)
        var isLongitudeBit = true

        for char in hash {
            guard let index = indexOf[char] else { return nil }
            for shift in stride(from: 4, through: 0, by: -1) {
                let bit = (index >> shift) & 1
                if isLongitudeBit {
                    let mid = (lon.min + lon.max) / 2
                    if bit == 1 { lon.min = mid } else { lon.max = mid }
                } else {
                    let mid = (lat.min + lat.max) / 2
                    if bit == 1 { lat.min = mid } else { lat.max = mid }
                }
                isLongitudeBit.toggle()
            }
        }
        return GeoCoordinate(latitude: (lat.min + lat.max) / 2, longitude: (lon.min + lon.max) / 2)
    }
}
