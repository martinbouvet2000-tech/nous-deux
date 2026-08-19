import type { LucideIcon } from 'lucide-react'

interface Tab<K extends string> { key: K; label: string; icon?: LucideIcon }

/** Segmented control unique pour toute l'app (un seul style d'état actif) */
export default function Tabs<K extends string>({ tabs, value, onChange, label }: { tabs: Tab<K>[]; value: K; onChange: (k: K) => void; label: string }) {
  return (
    <div className="flex gap-1 p-1 rounded-full bg-white/[0.04] shadow-[inset_0_0_0_1px_rgba(240,234,224,0.06)]" role="tablist" aria-label={label}>
      {tabs.map(({ key, label: l, icon: Icon }) => {
        const active = value === key
        return (
          <button
            key={key}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={`flex-1 min-h-10 px-3 rounded-full text-[13px] font-medium whitespace-nowrap transition-all duration-200 flex items-center justify-center gap-1.5 ${
              active ? 'bg-white/[0.08] text-[#F0EAE0] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_0_0_1px_rgba(212,165,116,0.25)]' : 'text-[#9B9287] hover:text-[#F0EAE0]'
            }`}
          >
            {Icon && <Icon size={14} aria-hidden="true" className={active ? 'text-[#D4A574]' : ''} />}
            <span className="truncate">{l}</span>
          </button>
        )
      })}
    </div>
  )
}
