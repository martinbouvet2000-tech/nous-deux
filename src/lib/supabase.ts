import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

if (!supabaseUrl || !supabaseAnonKey) {
  const missing: string[] = []
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!supabaseAnonKey) missing.push('VITE_SUPABASE_ANON_KEY')
  throw new Error(
    `[nous-deux] Variables d'environnement manquantes : ${missing.join(', ')}.\n` +
    `Créez un fichier .env.local à la racine du projet avec :\n` +
    `  VITE_SUPABASE_URL=https://votre-projet.supabase.co\n` +
    `  VITE_SUPABASE_ANON_KEY=sb_publishable_xxx`
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
