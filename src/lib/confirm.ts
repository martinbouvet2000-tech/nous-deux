import { create } from 'zustand'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  cancelLabel?: string
  /** Action destructrice : bouton rouge */
  danger?: boolean
  /**
   * Affiche l’avertissement « Action irréversible ». Par défaut, une action
   * `danger` est réputée irréversible ; passer `false` quand elle ne l’est pas
   * (se délier, par exemple) pour ne pas contredire le message affiché.
   */
  irreversible?: boolean
}

interface ConfirmState {
  open: boolean
  options: ConfirmOptions
  resolve: ((v: boolean) => void) | null
  ask: (o: ConfirmOptions) => Promise<boolean>
  close: (v: boolean) => void
}

export const useConfirmStore = create<ConfirmState>((set, get) => ({
  open: false,
  options: { title: '' },
  resolve: null,
  ask: (options) =>
    new Promise<boolean>((resolve) => {
      // S’il y a déjà une demande en cours, on la refuse proprement
      get().resolve?.(false)
      set({ open: true, options, resolve })
    }),
  close: (v) => {
    get().resolve?.(v)
    set({ open: false, resolve: null })
  },
}))

/** `if (await confirm({ title: 'Supprimer ?' })) { … }` */
export const confirm = (o: ConfirmOptions) => useConfirmStore.getState().ask(o)

