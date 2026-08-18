import { NavLink, Outlet } from 'react-router-dom'
import { Home, MessageCircleHeart, Calendar, Camera, Sparkles, Settings, Heart } from 'lucide-react'
import AmbientMood from '@/components/AmbientMood'

/**
 * 6 destinations. Sur mobile : 5 + Réglages ("Plus") — tout est atteignable au pouce.
 * (Avant : "Activités" n'apparaissait nulle part sur mobile.)
 */
const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Accueil' },
  { to: '/thoughts', icon: MessageCircleHeart, label: 'Pensées' },
  { to: '/calendar', icon: Calendar, label: 'Agenda' },
  { to: '/memories', icon: Camera, label: 'Souvenirs' },
  { to: '/activities', icon: Sparkles, label: 'À deux' },
]

export default function AppLayout() {
  return (
    <div className="flex min-h-dvh bg-[#110F0E]">
      {/* ─── Desktop sidebar ─── */}
      <nav className="hidden md:flex flex-col w-[232px] bg-[#161411]/90 backdrop-blur-2xl shrink-0 fixed h-dvh z-40" aria-label="Navigation principale">
        <div className="absolute right-0 top-0 bottom-0 w-px bg-[rgba(212,165,116,0.04)]" />
        <div className="px-6 pt-8 pb-8">
          <div className="flex items-center gap-3">
            <Heart size={17} className="text-[#D4A574]/50" fill="currentColor" aria-hidden="true" />
            <span className="text-[15px] font-light text-[#F0EAE0]/90 tracking-tight">Nous Deux</span>
          </div>
        </div>

        <div className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {[...NAV_ITEMS, { to: '/settings', icon: Settings, label: 'Réglages' }].map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-4 py-2.5 text-[13px] tracking-wide transition-all duration-300 ease-out rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#D4A574]/40 ${
                  isActive ? 'text-[#F0EAE0] font-medium' : 'text-[#8A8177] hover:text-[#B5ACA1]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-[#D4A574] transition-all duration-300 ease-out ${isActive ? 'h-4 opacity-100' : 'h-0 opacity-0'}`} aria-hidden="true" />
                  <Icon size={16} strokeWidth={isActive ? 1.8 : 1.5} className={`shrink-0 transition-all duration-300 ${isActive ? 'text-[#D4A574]/80' : 'text-[#8A8177] group-hover:text-[#B5ACA1]'}`} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="px-6 py-5">
          <p className="text-xs text-[#8A8177]/60 text-center tracking-widest">
            Fait avec <span className="text-[#D4A574]/40">&#9829;</span> pour vous deux
          </p>
        </div>
      </nav>

      {/* ─── Main content ─── */}
      <main className="flex-1 md:ml-[232px] pb-24 md:pb-6 overflow-y-auto min-w-0" id="main">
        <AmbientMood>
          <Outlet />
        </AmbientMood>
      </main>

      {/* ─── Mobile bottom nav ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40" aria-label="Navigation principale">
        <div className="h-px bg-[rgba(212,165,116,0.04)]" />
        <div className="bg-[#161411]/95 backdrop-blur-2xl">
          <div className="flex justify-around items-center px-1 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {[...NAV_ITEMS, { to: '/settings', icon: Settings, label: 'Plus' }].map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                aria-label={label}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 min-w-[48px] py-1 transition-all duration-300 ease-out ${
                    isActive ? 'text-[#D4A574]' : 'text-[#8A8177] active:text-[#B5ACA1]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={20} strokeWidth={isActive ? 1.8 : 1.5} aria-hidden="true" />
                    <span className="text-[11px] tracking-wide leading-none">{label}</span>
                    <div className={`w-[3px] h-[3px] rounded-full transition-all duration-300 ${isActive ? 'bg-[#D4A574] scale-100 opacity-100' : 'bg-transparent scale-0 opacity-0'}`} aria-hidden="true" />
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </div>
      </nav>
    </div>
  )
}
