import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

// Mock supabase — use vi.hoisted so refs exist when vi.mock factory runs
const { mockGetSession, mockOnAuthStateChange } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockOnAuthStateChange: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
  },
}))

import App from '@/App'

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
  })

  it('shows loading spinner initially', () => {
    mockGetSession.mockReturnValue(new Promise(() => {})) // never resolves
    render(<App />)
    expect(screen.getByText('Chargement...')).toBeInTheDocument()
  })

  it('shows login when no session', async () => {
    mockGetSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    render(<App />)
    const headings = await screen.findAllByText('Nous Deux')
    expect(headings.length).toBeGreaterThanOrEqual(1)
  })
})
