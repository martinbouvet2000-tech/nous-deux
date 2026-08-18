import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

const { mockFrom, mockRpc, mockSignIn, mockSignUp, mockSignOut, mockReset, mockUpdateUser } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
  mockReset: vi.fn(),
  mockUpdateUser: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
      resetPasswordForEmail: mockReset,
      updateUser: mockUpdateUser,
    },
  },
}))

import { useAuthStore } from '../authStore'

const fakeUser: User = {
  id: 'user-123',
  email: 'test@example.com',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: '2024-01-01T00:00:00Z',
} as User

const fakeProfile = {
  id: 'user-123',
  display_name: 'Martin',
  avatar_url: null,
  timezone: 'Europe/Paris',
  location_city: null,
  location_country: null,
  location_lat: null,
  location_lng: null,
  partner_id: null,
  partner_code: 'ABCD1234',
  relationship_start: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const fakePartner = { ...fakeProfile, id: 'partner-456', display_name: 'Clarisse', partner_code: 'EFGH5678' }

/** Chaîne de requête factice : chaque appel renvoie `result` en fin de chaîne */
function chainable(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update', 'in', 'gte', 'limit', 'order', 'insert', 'upsert', 'neq', 'lt', 'delete']) {
    chain[m] = vi.fn().mockReturnValue(chain)
  }
  chain.single = vi.fn().mockResolvedValue(result)
  chain.maybeSingle = vi.fn().mockResolvedValue(result)
  return chain
}

function resetStore() {
  useAuthStore.setState({ user: null, profile: null, partnerProfile: null, loading: true })
}

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  it('setUser sets / clears the user', () => {
    useAuthStore.getState().setUser(fakeUser)
    expect(useAuthStore.getState().user).toEqual(fakeUser)
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState().user).toBeNull()
  })

  it('fetchProfile does nothing if no user', async () => {
    await useAuthStore.getState().fetchProfile()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('fetchProfile stores profile (no partner)', async () => {
    useAuthStore.setState({ user: fakeUser })
    mockFrom.mockReturnValue(chainable({ data: fakeProfile, error: null }))
    await useAuthStore.getState().fetchProfile()
    expect(useAuthStore.getState().profile).toEqual(fakeProfile)
    expect(useAuthStore.getState().partnerProfile).toBeNull()
  })

  it('fetchProfile also loads the partner profile', async () => {
    useAuthStore.setState({ user: fakeUser })
    mockFrom
      .mockReturnValueOnce(chainable({ data: { ...fakeProfile, partner_id: 'partner-456' }, error: null }))
      .mockReturnValueOnce(chainable({ data: fakePartner, error: null }))
    await useAuthStore.getState().fetchProfile()
    expect(useAuthStore.getState().partnerProfile).toEqual(fakePartner)
  })

  it('fetchProfile creates a profile client-side when none exists (fallback)', async () => {
    useAuthStore.setState({ user: { ...fakeUser, user_metadata: { display_name: 'Martin' } } as User })
    mockFrom
      .mockReturnValueOnce(chainable({ data: null, error: null }))            // select → rien
      .mockReturnValueOnce(chainable({ data: fakeProfile, error: null }))     // insert().select().single()
    await useAuthStore.getState().fetchProfile()
    expect(useAuthStore.getState().profile).toEqual(fakeProfile)
  })

  it('signIn stores the user then fetches the profile', async () => {
    mockSignIn.mockResolvedValue({ data: { user: fakeUser }, error: null })
    mockFrom.mockReturnValue(chainable({ data: fakeProfile, error: null }))
    await useAuthStore.getState().signIn('test@example.com', 'password')
    expect(mockSignIn).toHaveBeenCalledWith({ email: 'test@example.com', password: 'password' })
    expect(useAuthStore.getState().user).toEqual(fakeUser)
    expect(useAuthStore.getState().profile).toEqual(fakeProfile)
  })

  it('signIn maps Supabase errors to a friendly French message', async () => {
    mockSignIn.mockResolvedValue({ data: { user: null }, error: { message: 'Invalid login credentials' } })
    await expect(useAuthStore.getState().signIn('a@b.c', 'x')).rejects.toThrow('Email ou mot de passe incorrect.')
  })

  it('signUp passes display_name in metadata and reports email confirmation when no session', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { ...fakeUser, identities: [{}] }, session: null }, error: null })
    const res = await useAuthStore.getState().signUp('new@example.com', 'password123', 'Martin')
    expect(mockSignUp).toHaveBeenCalledWith(expect.objectContaining({
      email: 'new@example.com',
      options: expect.objectContaining({ data: { display_name: 'Martin' } }),
    }))
    expect(res.needsEmailConfirmation).toBe(true)
    // Le profil est créé par le trigger serveur : pas d'insert client
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('signUp with an immediate session logs the user in', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { ...fakeUser, identities: [{}] }, session: { access_token: 't' } }, error: null })
    mockFrom.mockReturnValue(chainable({ data: fakeProfile, error: null }))
    const res = await useAuthStore.getState().signUp('new@example.com', 'password123', 'Martin')
    expect(res.needsEmailConfirmation).toBe(false)
    expect(useAuthStore.getState().profile).toEqual(fakeProfile)
  })

  it('signUp detects an already-registered email (empty identities)', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { ...fakeUser, identities: [] }, session: null }, error: null })
    await expect(useAuthStore.getState().signUp('dup@example.com', 'password123', 'X')).rejects.toThrow(/existe déjà/)
  })

  it('requestPasswordReset calls Supabase with a redirect to /reset-password', async () => {
    mockReset.mockResolvedValue({ error: null })
    await useAuthStore.getState().requestPasswordReset('a@b.c')
    expect(mockReset).toHaveBeenCalledWith('a@b.c', expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') }))
  })

  it('signOut clears state even if Supabase throws', async () => {
    useAuthStore.setState({ user: fakeUser, profile: fakeProfile, partnerProfile: fakePartner })
    mockSignOut.mockRejectedValue(new Error('network'))
    await useAuthStore.getState().signOut()
    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().partnerProfile).toBeNull()
  })

  it('linkPartner rejects codes that are not 8 chars', async () => {
    await expect(useAuthStore.getState().linkPartner('abc')).rejects.toThrow('8 caractères')
    expect(mockRpc).not.toHaveBeenCalled()
  })

  it('linkPartner surfaces business errors raised by SQL (P0001) verbatim', async () => {
    mockRpc.mockResolvedValue({ error: { code: 'P0001', message: 'Code invalide ou introuvable' } })
    await expect(useAuthStore.getState().linkPartner('abcd1234')).rejects.toThrow('Code invalide ou introuvable')
    expect(mockRpc).toHaveBeenCalledWith('link_partner_by_code', { invite_code: 'ABCD1234' })
  })

  it('linkPartner refetches the profile on success', async () => {
    useAuthStore.setState({ user: fakeUser })
    mockRpc.mockResolvedValue({ error: null })
    mockFrom
      .mockReturnValueOnce(chainable({ data: { ...fakeProfile, partner_id: 'partner-456' }, error: null }))
      .mockReturnValueOnce(chainable({ data: fakePartner, error: null }))
    await useAuthStore.getState().linkPartner('EFGH5678')
    expect(useAuthStore.getState().partnerProfile).toEqual(fakePartner)
  })
})
