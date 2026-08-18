import { create } from 'zustand'
import type { User } from '@supabase/supabase-js'
import type { Profile } from '@/types/database'
import { supabase } from '@/lib/supabase'
import { humanizeError } from '@/lib/db'

interface AuthState {
  user: User | null
  profile: Profile | null
  partnerProfile: Profile | null
  /** true tant que la session initiale n'a pas été résolue */
  loading: boolean
  setUser: (user: User | null) => void
  setLoading: (v: boolean) => void
  fetchProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  /** Renvoie true si une confirmation email est attendue (pas de session immédiate) */
  signUp: (email: string, password: string, displayName: string) => Promise<{ needsEmailConfirmation: boolean }>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  linkPartner: (code: string) => Promise<void>
  unlinkPartner: () => Promise<void>
  deleteAccount: () => Promise<void>
}

/** URL de base absolue de l'app (respecte le sous-chemin GitHub Pages) */
export function appUrl(path = '/'): string {
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  return `${window.location.origin}${base}${path.startsWith('/') ? path : `/${path}`}`
}

function wrap(err: unknown): Error {
  return new Error(humanizeError(err))
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  partnerProfile: null,
  loading: true,

  setUser: (user) => set({ user }),
  setLoading: (loading) => set({ loading }),

  fetchProfile: async () => {
    const { user } = get()
    if (!user) return

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle()

      if (error) {
        console.error('[authStore] fetchProfile error:', error.message)
        return
      }

      if (!profile) {
        // Cas rare : compte créé avant le trigger serveur → on crée le profil côté client
        const displayName =
          (user.user_metadata?.display_name as string | undefined)?.trim() ||
          user.email?.split('@')[0] ||
          'Moi'
        const { data: created, error: insertError } = await supabase
          .from('profiles')
          .insert({ id: user.id, display_name: displayName })
          .select('*')
          .single()
        if (insertError) {
          console.error('[authStore] profile insert error:', insertError.message)
          return
        }
        set({ profile: created, partnerProfile: null })
        return
      }

      set({ profile })

      if (profile.partner_id) {
        const { data: partner, error: partnerError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', profile.partner_id)
          .maybeSingle()
        if (partnerError) {
          console.error('[authStore] fetchPartner error:', partnerError.message)
        } else {
          set({ partnerProfile: partner ?? null })
        }
      } else {
        set({ partnerProfile: null })
      }
    } catch (err) {
      console.error('[authStore] fetchProfile unexpected error:', err)
    }
  },

  signIn: async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw wrap(error)
    if (data.user) {
      set({ user: data.user })
      await get().fetchProfile()
    }
  },

  signUp: async (email, password, displayName) => {
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { display_name: displayName.trim() },
        emailRedirectTo: appUrl('/'),
      },
    })
    if (error) throw wrap(error)

    // Supabase renvoie un user avec identities vide quand l'email existe déjà (confirmation activée)
    if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
      throw new Error('Un compte existe déjà avec cet email. Connecte-toi ou réinitialise ton mot de passe.')
    }

    if (data.session && data.user) {
      set({ user: data.user })
      await get().fetchProfile()
      return { needsEmailConfirmation: false }
    }
    return { needsEmailConfirmation: true }
  },

  requestPasswordReset: async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: appUrl('/reset-password'),
    })
    if (error) throw wrap(error)
  },

  updatePassword: async (password) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw wrap(error)
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
    if (trimmed.length !== 8) throw new Error('Le code fait 8 caractères.')
    const { error } = await supabase.rpc('link_partner_by_code', { invite_code: trimmed })
    if (error) throw wrap(error)
    await get().fetchProfile()
  },

  unlinkPartner: async () => {
    const { error } = await supabase.rpc('unlink_partner')
    if (error) throw wrap(error)
    await get().fetchProfile()
  },

  deleteAccount: async () => {
    const { error } = await supabase.rpc('delete_my_account')
    if (error) throw wrap(error)
    await get().signOut()
  },
}))
