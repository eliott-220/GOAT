import { describe, expect, it } from 'vitest'
import { OAUTH_PROVIDER_LABELS, parseProviders } from '../src/auth/providers'

describe('fournisseurs de connexion (VITE_AUTH_PROVIDERS)', () => {
  it('ne garde que les fournisseurs connus, sans doublon ni casse', () => {
    expect(parseProviders('google')).toEqual(['google'])
    expect(parseProviders(' Google , GOOGLE ,facebook,, ')).toEqual(['google'])
  })

  it('rien de configuré : aucun bouton', () => {
    expect(parseProviders(undefined)).toEqual([])
    expect(parseProviders('')).toEqual([])
    expect(parseProviders('apple')).toEqual([]) // Apple : pas encore pris en charge (compte Apple Developer payant requis)
  })

  it('chaque fournisseur a un libellé pour son bouton', () => {
    for (const provider of parseProviders('google')) expect(OAUTH_PROVIDER_LABELS[provider]).toBeTruthy()
  })
})
