import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { User } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Mock supabase client — vi.hoisted ensures these exist before vi.mock runs
// ---------------------------------------------------------------------------

const { mockFrom, mockRpc, mockSignIn, mockSignUp, mockSignOut } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockSignIn: vi.fn(),
  mockSignUp: vi.fn(),
  mockSignOut: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: mockFrom,
    rpc: mockRpc,
    auth: {
      signInWithPassword: mockSignIn,
      signUp: mockSignUp,
      signOut: mockSignOut,
    },
  },
}))

// Import after mock so the store picks up the mocked module
import { useAuthStore } from '../authStore'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
}

const fakePartner = {
  ...fakeProfile,
  id: 'partner-456',
  display_name: 'Partner',
  partner_code: 'EFGH5678',
}

/** Build a chainable query mock */
function chainable(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  chain.select = vi.fn().mockReturnValue(chain)
  chain.eq = vi.fn().mockReturnValue(chain)
  chain.single = vi.fn().mockResolvedValue(result)
  chain.insert = vi.fn().mockResolvedValue(result)
  chain.update = vi.fn().mockReturnValue(chain)
  chain.in = vi.fn().mockReturnValue(chain)
  chain.gte = vi.fn().mockReturnValue(chain)
  chain.limit = vi.fn().mockReturnValue(chain)
  chain.order = vi.fn().mockReturnValue(chain)
  chain.abortSignal = vi.fn().mockReturnValue(chain)
  return chain
}

function resetStore() {
  useAuthStore.setState({
    user: null,
    profile: null,
    partnerProfile: null,
    loading: true,
  })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetStore()
  })

  // ---- setUser ----
  it('setUser sets the user in state', () => {
    useAuthStore.getState().setUser(fakeUser)
    expect(useAuthStore.getState().user).toEqual(fakeUser)
  })

  it('setUser(null) clears the user', () => {
    useAuthStore.getState().setUser(fakeUser)
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState().user).toBeNull()
  })

  // ---- fetchProfile ----
  it('fetchProfile does nothing if no user', async () => {
    await useAuthStore.getState().fetchProfile()
    expect(mockFrom).not.toHaveBeenCalled()
  })

  it('fetchProfile fetches profile and stores it', async () => {
    useAuthStore.setState({ user: fakeUser })

    const profileChain = chainable({ data: fakeProfile, error: null })
    mockFrom.mockReturnValue(profileChain)

    await useAuthStore.getState().fetchProfile()

    expect(mockFrom).toHaveBeenCalledWith('profiles')
    expect(useAuthStore.getState().profile).toEqual(fakeProfile)
    expect(useAuthStore.getState().partnerProfile).toBeNull()
  })

  it('fetchProfile fetches partner when partner_id exists', async () => {
    useAuthStore.setState({ user: fakeUser })

    const profileWithPartner = { ...fakeProfile, partner_id: 'partner-456' }
    let callCount = 0

    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) {
        return chainable({ data: profileWithPartner, error: null })
      }
      return chainable({ data: fakePartner, error: null })
    })

    await useAuthStore.getState().fetchProfile()

    expect(useAuthStore.getState().profile).toEqual(profileWithPartner)
    expect(useAuthStore.getState().partnerProfile).toEqual(fakePartner)
  })

  it('fetchProfile handles supabase error gracefully', async () => {
    useAuthStore.setState({ user: fakeUser })
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    mockFrom.mockReturnValue(
      chainable({ data: null, error: { message: 'Not found' } })
    )

    await useAuthStore.getState().fetchProfile()

    expect(consoleSpy).toHaveBeenCalledWith(
      '[authStore] fetchProfile error:',
      'Not found'
    )
    expect(useAuthStore.getState().profile).toBeNull()
    consoleSpy.mockRestore()
  })

  // ---- signIn ----
  it('signIn calls supabase and sets user + fetches profile', async () => {
    mockSignIn.mockResolvedValue({ data: { user: fakeUser, session: {} }, error: null })
    mockFrom.mockReturnValue(chainable({ data: fakeProfile, error: null }))

    await useAuthStore.getState().signIn('test@example.com', 'password')

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'test@example.com',
      password: 'password',
    })
    expect(useAuthStore.getState().user).toEqual(fakeUser)
  })

  it('signIn throws on error', async () => {
    const authError = { message: 'Invalid credentials', status: 401 }
    mockSignIn.mockResolvedValue({ data: { user: null, session: null }, error: authError })

    await expect(
      useAuthStore.getState().signIn('bad@email.com', 'wrong')
    ).rejects.toEqual(authError)
  })

  // ---- signUp ----
  it('signUp creates user and inserts profile', async () => {
    mockSignUp.mockResolvedValue({ data: { user: fakeUser }, error: null })
    mockFrom.mockReturnValue(chainable({ data: null, error: null }))

    await useAuthStore.getState().signUp('new@example.com', 'password', 'NewUser')

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'new@example.com',
      password: 'password',
    })
    expect(mockFrom).toHaveBeenCalledWith('profiles')
  })

  it('signUp throws if auth fails', async () => {
    const authError = { message: 'Email already in use' }
    mockSignUp.mockResolvedValue({ data: { user: null }, error: authError })

    await expect(
      useAuthStore.getState().signUp('existing@example.com', 'password', 'User')
    ).rejects.toEqual(authError)
  })

  it('signUp throws friendly error if profile insert fails', async () => {
    mockSignUp.mockResolvedValue({ data: { user: fakeUser }, error: null })

    const insertChain = chainable({ data: null, error: null })
    insertChain.insert = vi.fn().mockResolvedValue({ error: { message: 'duplicate key' } })
    mockFrom.mockReturnValue(insertChain)

    await expect(
      useAuthStore.getState().signUp('new@example.com', 'password', 'User')
    ).rejects.toThrow('Compte créé mais erreur lors de la création du profil')
  })

  // ---- signOut ----
  it('signOut clears all state', async () => {
    useAuthStore.setState({
      user: fakeUser,
      profile: fakeProfile as any,
      partnerProfile: fakePartner as any,
    })

    mockSignOut.mockResolvedValue({ error: null })

    await useAuthStore.getState().signOut()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().profile).toBeNull()
    expect(useAuthStore.getState().partnerProfile).toBeNull()
  })

  it('signOut clears state even if supabase throws', async () => {
    useAuthStore.setState({ user: fakeUser, profile: fakeProfile as any })
    mockSignOut.mockRejectedValue(new Error('network error'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    await useAuthStore.getState().signOut()
    consoleSpy.mockRestore()

    expect(useAuthStore.getState().user).toBeNull()
    expect(useAuthStore.getState().profile).toBeNull()
  })

  // ---- linkPartner ----
  it('linkPartner calls rpc and refetches profile', async () => {
    useAuthStore.setState({ user: fakeUser })
    mockRpc.mockResolvedValue({ error: null })

    const profileWithPartner = { ...fakeProfile, partner_id: 'partner-456' }
    let callCount = 0
    mockFrom.mockImplementation(() => {
      callCount++
      if (callCount === 1) return chainable({ data: profileWithPartner, error: null })
      return chainable({ data: fakePartner, error: null })
    })

    await useAuthStore.getState().linkPartner('  abcd1234  ')

    expect(mockRpc).toHaveBeenCalledWith('link_partner_by_code', {
      invite_code: 'ABCD1234',
    })
  })

  it('linkPartner throws on empty code', async () => {
    await expect(
      useAuthStore.getState().linkPartner('   ')
    ).rejects.toThrow('Le code partenaire ne peut pas être vide')
  })

  it('linkPartner throws on rpc error', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'Invalid code' } })

    await expect(
      useAuthStore.getState().linkPartner('BADCODE')
    ).rejects.toThrow('Invalid code')
  })
})
