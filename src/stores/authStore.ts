import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  profile: Profile | null
  partnerProfile: Profile | null
  loading: boolean
  setUser: (user: User | null) => void
  fetchProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, displayName: string) => Promise<void>
  signOut: () => Promise<void>
  linkPartner: (code: string) => Promise<void>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  partnerProfile: null,
  loading: true,

  setUser: (user) => set({ user }),

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('[authStore] fetchProfile error:', error.message)
        return
      }

      if (profile) {
        set({ profile })

        if (profile.partner_id) {
          try {
            const { data: partner, error: partnerError } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', profile.partner_id)
              .single()

            if (partnerError) {
              console.error('[authStore] fetchPartner error:', partnerError.message)
            } else if (partner) {
              set({ partnerProfile: partner })
            }
          } catch (err) {
            console.error('[authStore] fetchPartner unexpected error:', err)
          }
        } else {
          // Ensure partnerProfile is cleared if no partner_id
          set({ partnerProfile: null })
        }
      }
    } catch (err) {
      console.error('[authStore] fetchProfile unexpected error:', err)
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    // Set user immediately and fetch profile for faster UX
    if (data.user) {
      set({ user: data.user })
      await get().fetchProfile()
    }
  },

  signUp: async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    if (data.user) {
      const { error: insertError } = await supabase.from('profiles').insert({
        id: data.user.id,
        display_name: displayName,
      })
      if (insertError) {
        console.error('[authStore] profile insert error:', insertError.message)
        throw new Error('Compte créé mais erreur lors de la création du profil. Reconnecte-toi.')
      }
    }
  },

  signOut: async () => {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('[authStore] signOut error:', err)
    } finally {
      set({ user: null, profile: null, partnerProfile: null })
    }
  },

  linkPartner: async (code: string) => {
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) throw new Error('Le code partenaire ne peut pas être vide.')

    const { error } = await supabase.rpc('link_partner_by_code', {
      invite_code: trimmed,
    })
    if (error) throw new Error(error.message)
    await get().fetchProfile()
  },
}))
