import { describe, expect, it } from 'vitest'
import { MIN_PASSWORD_LENGTH, accountStepProblem, isValidEmail, passwordProblem } from '../src/auth/validation'

describe('email et mot de passe', () => {
  it('reconnaît une adresse plausible, sans être pointilleux (le serveur a le dernier mot)', () => {
    expect(isValidEmail('lea@example.com')).toBe(true)
    expect(isValidEmail('  lea.martin+ski@sub.example.fr ')).toBe(true)
    for (const bad of ['', 'lea', 'lea@', '@example.com', 'lea@example', 'lea @example.com', 'lea@example.c']) expect(isValidEmail(bad), bad).toBe(false)
  })

  it('exige la longueur minimale du mot de passe', () => {
    expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH))).toBeUndefined()
    expect(passwordProblem('x'.repeat(MIN_PASSWORD_LENGTH - 1))).toMatch(/8 caractères/)
  })
})

describe('étape « Compte » de l\'inscription (email + mot de passe + confirmation)', () => {
  const good = { email: 'lea@example.com', password: 'motdepasse1' }

  it('accepte des valeurs cohérentes', () => {
    expect(accountStepProblem(good.email, good.password, good.password)).toBeUndefined()
  })

  it('signale, dans l\'ordre : email invalide, mot de passe trop court, confirmation différente', () => {
    expect(accountStepProblem('pas-un-email', good.password, good.password)).toMatch(/adresse email/)
    expect(accountStepProblem(good.email, 'court', 'court')).toMatch(/trop court/)
    expect(accountStepProblem(good.email, good.password, 'motdepasse2')).toBe('Les deux mots de passe sont différents.')
    expect(accountStepProblem(good.email, good.password, '')).toBe('Les deux mots de passe sont différents.')
  })
})
