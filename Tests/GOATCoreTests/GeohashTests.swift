import Testing
@testable import GOATCore

@Suite struct GeohashTests {
    @Test func encodeKnownVectors() {
        // Exemples de référence (Wikipedia).
        #expect(Geohash.encode(latitude: 57.64911, longitude: 10.40744, precision: 11) == "u4pruydqqvj")
        #expect(Geohash.encode(latitude: 42.6, longitude: -5.6, precision: 5) == "ezs42")
    }

    @Test func decodeReturnsCellCenter() throws {
        let center = try #require(Geohash.decode("ezs42"))
        #expect(abs(center.latitude - 42.605) < 0.001)
        #expect(abs(center.longitude - -5.603) < 0.001)
    }

    @Test func decodeRejectsInvalidCharacters() {
        #expect(Geohash.decode("ezs4a") == nil) // 'a' n'existe pas dans l'alphabet geohash
    }

    @Test func publicPrecisionKeepsPositionWithinAFewHundredMeters() throws {
        let exact = GeoCoordinate(latitude: 45.9237, longitude: 6.8694)
        let hash = Geohash.encode(latitude: exact.latitude, longitude: exact.longitude)
        #expect(hash.count == Geohash.publicPrecision)
        let rounded = try #require(Geohash.decode(hash))
        #expect(exact.distance(to: rounded) < 150)
        #expect(exact != rounded, "la position diffusée ne doit pas être la position exacte")
    }
}
