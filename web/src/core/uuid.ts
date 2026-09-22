/** UUID v4. `crypto.randomUUID` n'existe qu'en contexte sécurisé (HTTPS) : on passe par getRandomValues. */
export function uuidFromBytes(bytes: Uint8Array): string {
  const b = Uint8Array.from(bytes)
  b[6] = (b[6]! & 0x0f) | 0x40
  b[8] = (b[8]! & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0'))
  return `${h.slice(0, 4).join('')}-${h.slice(4, 6).join('')}-${h.slice(6, 8).join('')}-${h.slice(8, 10).join('')}-${h.slice(10).join('')}`
}

export function uuid(): string {
  return uuidFromBytes(crypto.getRandomValues(new Uint8Array(16)))
}
