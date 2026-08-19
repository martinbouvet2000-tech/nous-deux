/** Classes Tailwind partagées — une seule source de vérité pour le style des contrôles */
export const BTN_PRIMARY =
  'btn-shine inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2 rounded-full text-sm font-medium bg-gradient-to-br from-[#D4A574] to-[#C2788E] text-[#110F0E] shadow-[0_10px_30px_-14px_rgba(194,120,142,0.7)] hover:shadow-[0_14px_36px_-14px_rgba(212,165,116,0.8)] hover:-translate-y-px active:translate-y-0 active:scale-[0.98] transition-all duration-200 ease-out disabled:bg-none disabled:bg-[#2A2523] disabled:text-[#6B635B] disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:shadow-none'

export const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2 rounded-full text-sm font-medium text-[#F0EAE0]/90 bg-transparent shadow-[inset_0_0_0_1px_rgba(255,255,255,0.10)] hover:bg-white/[0.06] active:scale-[0.98] transition-all duration-200 ease-out disabled:opacity-60 disabled:cursor-not-allowed'

export const BTN_DANGER =
  'inline-flex items-center justify-center gap-2 min-h-11 px-5 py-2 rounded-full text-sm font-medium text-[#FFF2F4] bg-[#B4475E] shadow-[0_10px_30px_-14px_rgba(180,71,94,0.8)] hover:bg-[#C2536A] hover:-translate-y-px active:scale-[0.98] transition-all duration-200 ease-out disabled:opacity-60 disabled:cursor-not-allowed'

export const INPUT =
  'w-full min-h-11 bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.07)] rounded-xl px-4 py-3 text-sm text-[#F0EAE0] placeholder-[#9B9287] outline-none transition-all duration-200 ease-out focus:bg-white/[0.06] focus:shadow-[inset_0_0_0_1px_rgba(232,201,160,0.7)]'

export const CARD =
  'lux-card relative overflow-hidden rounded-[20px] p-5 md:p-6 transition-all duration-500 ease-out'

export const CARD_EDGE =
  'absolute top-0 left-[15%] right-[15%] h-px bg-gradient-to-r from-transparent via-[rgba(212,165,116,0.22)] to-transparent'

export const ICON_BTN =
  'inline-flex items-center justify-center w-11 h-11 rounded-full text-[#9B9287] hover:text-[#F0EAE0] hover:bg-white/[0.06] transition-all duration-200 ease-out'

export const LABEL = 'block text-[11px] font-medium tracking-[0.12em] uppercase text-[#9B9287] mb-2'

/** Sélecteur natif : chevron or dessiné en CSS, pas de flèche système */
export const SELECT =
  "appearance-none pr-10 bg-no-repeat bg-[right_0.9rem_center] bg-[length:14px_14px] bg-[url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D4A574' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")]"

/** Zone « danger » de confirmation */
export const DANGER_TEXT = 'text-[#F0A5AD]'

/** Titre de carte / section : Fraunces, accompagné d'une icône or */
export const CARD_TITLE = 'font-display text-[17px] tracking-tight text-[#F0EAE0] flex items-center gap-2'

/** Sur-titre micro-capitales */
export const EYEBROW = 'text-[11px] tracking-[0.2em] uppercase text-[#9B9287]'
