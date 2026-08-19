import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

/** État vide composé : pastille or/rose, titre Fraunces, phrase chaleureuse, action optionnelle */
export default function EmptyState({ icon: Icon, title, text, action }: { icon: LucideIcon; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="rounded-[20px] py-12 px-6 text-center shadow-[inset_0_0_0_1px_rgba(240,234,224,0.07)] [border:1px_dashed_rgba(240,234,224,0.08)]">
      <div className="mx-auto size-14 rounded-full grid place-items-center mb-4 bg-gradient-to-br from-[#D4A574]/15 to-[#C2788E]/15 shadow-[inset_0_0_0_1px_rgba(212,165,116,0.22)]">
        <Icon size={24} className="text-[#D4A574]/85" aria-hidden="true" />
      </div>
      <p className="font-display text-[20px] text-[#F0EAE0]">{title}</p>
      {text && <p className="mt-1.5 text-[13px] text-[#9B9287] max-w-[38ch] mx-auto leading-relaxed">{text}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  )
}
