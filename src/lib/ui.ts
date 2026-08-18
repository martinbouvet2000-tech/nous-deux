/** Classes Tailwind partagées — une seule source de vérité pour le style des contrôles */
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-gradient-to-r from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_2px_20px_rgba(212,165,116,0.2)] hover:shadow-[0_4px_28px_rgba(212,165,116,0.35)] hover:translate-y-[-1px] active:translate-y-0 active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/60'

export const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-[#9B9287] bg-transparent hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/40'

export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-red-300 bg-[rgba(239,68,68,0.10)] hover:bg-[rgba(239,68,68,0.18)] active:scale-[0.98] transition-all duration-300 ease-out disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50'

export const INPUT =
  'w-full bg-[rgba(255,255,255,0.03)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#8A8177] outline-none transition-all duration-300 ease-out focus:bg-[rgba(255,255,255,0.05)] focus:shadow-[0_0_0_2px_rgba(212,165,116,0.15),0_0_0_1px_rgba(212,165,116,0.08)]'

export const CARD =
  'relative overflow-hidden rounded-2xl p-5 md:p-6 bg-[#1E1B17] transition-all duration-500 ease-out'

export const CARD_EDGE =
  'absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.12)] to-transparent opacity-60'

export const ICON_BTN =
  'inline-flex items-center justify-center w-9 h-9 rounded-xl text-[#8A8177] hover:text-[#F0EAE0] hover:bg-[rgba(212,165,116,0.06)] transition-all duration-300 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/40'

export const LABEL = 'block text-xs tracking-wide text-[#8A8177] mb-1.5'
