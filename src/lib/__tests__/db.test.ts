import { describe, it, expect } from 'vitest'
import { humanizeError } from '../db'

describe('humanizeError', () => {
  it('passes business errors from SQL through verbatim', () => {
    expect(humanizeError({ code: 'P0001', message: 'Tu es déjà lié(e) à un(e) partenaire' })).toBe('Tu es déjà lié(e) à un(e) partenaire')
  })
  it('maps RLS / permission errors', () => {
    expect(humanizeError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/pas le droit/)
  })
  it('maps auth errors', () => {
    expect(humanizeError({ message: 'Invalid login credentials' })).toBe('Email ou mot de passe incorrect.')
    expect(humanizeError({ message: 'Email not confirmed' })).toMatch(/Confirme ton email/)
  })
  it('maps network errors', () => {
    expect(humanizeError(new TypeError('Failed to fetch'))).toMatch(/connexion/)
  })
  it('falls back to a generic message', () => {
    expect(humanizeError(null)).toMatch(/Une erreur est survenue/)
  })
})
