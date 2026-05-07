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

    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (profile) {
      set({ profile })

      if (profile.partner_id) {
        const { data: partner } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profile.partner_id)
          .single()

        if (partner) set({ partnerProfile: partner })
      }
    }
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  },

  signUp: async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw error

    if (data.user) {
      await supabase.from('profiles').insert({
        id: data.user.id,
        display_name: displayName,
      })
    }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, partnerProfile: null })
  },

  linkPartner: async (code: string) => {
    const { error } = await supabase.rpc('link_partner_by_code', {
      invite_code: code.trim().toUpperCase(),
    })
    if (error) throw new Error(error.message)
    await get().fetchProfile()
  },
}))
