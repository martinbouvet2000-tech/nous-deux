import { NavLink, Outlet } from 'react-router-dom'
import { Home, MessageCircleHeart, Calendar, Camera, Sparkles, Settings, Heart } from 'lucide-react'
import AmbientMood from '@/components/AmbientMood'

/**
 * 6 destinations. Sur mobile : 5 + Réglages ("Plus") — tout est atteignable au pouce.
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
    <div className="flex min-h-dvh bg-[#110F0E] grain">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-full focus:bg-[#D4A574] focus:text-[#110F0E] focus:text-sm">
        Aller au contenu
      </a>

      {/* ─── Desktop sidebar ─── */}
      <nav className="hidden md:flex flex-col w-[232px] bg-[#15120F]/92 backdrop-blur-2xl shrink-0 fixed h-dvh z-40 border-r border-[#F0EAE0]/[0.06]" aria-label="Navigation principale">
        <div className="px-6 pt-8 pb-7">
          <div className="flex items-center gap-3">
            <Heart size={17} className="text-[#D4A574]/70" fill="currentColor" aria-hidden="true" />
            <span className="font-display text-[17px] text-[#F0EAE0]/95 tracking-tight">Nous Deux</span>
          </div>
        </div>

        <div className="flex-1 px-3 space-y-1 overflow-y-auto">
          {[...NAV_ITEMS, { to: '/settings', icon: Settings, label: 'Réglages' }].map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-3.5 py-2.5 min-h-11 rounded-xl text-[13.5px] tracking-wide transition-all duration-200 ease-out ${
                  isActive
                    ? 'text-[#F0EAE0] bg-[#D4A574]/[0.08] shadow-[inset_0_0_0_1px_rgba(212,165,116,0.15)]'
                    : 'text-[#9B9287] hover:text-[#F0EAE0] hover:bg-[#F0EAE0]/[0.04]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`absolute -left-3 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-[#D4A574] transition-opacity duration-200 ${isActive ? 'opacity-100' : 'opacity-0'}`} aria-hidden="true" />
                  <Icon size={17} strokeWidth={isActive ? 1.9 : 1.6} className={`shrink-0 transition-colors duration-200 ${isActive ? 'text-[#D4A574]' : 'text-[#9B9287] group-hover:text-[#D4A574]/80'}`} aria-hidden="true" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <div className="px-6 py-5">
          <p className="text-[11px] text-[#9B9287] text-center tracking-widest">
            Fait avec <span className="text-[#D4A574]">&#9829;</span> pour vous deux
          </p>
        </div>
      </nav>

      {/* ─── Main content ─── */}
      <main className="flex-1 md:ml-[232px] pb-28 md:pb-6 overflow-y-auto min-w-0" id="main" tabIndex={-1}>
        <AmbientMood>
          <Outlet />
        </AmbientMood>
      </main>

      {/* ─── Mobile bottom nav ─── */}
      <div className="md:hidden pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] h-8 z-40 bg-gradient-to-t from-[#110F0E] to-transparent" aria-hidden="true" />
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#110F0E]/80 backdrop-blur-2xl backdrop-saturate-150 border-t border-[#F0EAE0]/[0.07] shadow-[0_-12px_32px_rgba(0,0,0,0.55)]" aria-label="Navigation principale">
        <div className="flex justify-around items-center px-1 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          {[...NAV_ITEMS, { to: '/settings', icon: Settings, label: 'Plus' }].map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              aria-label={label}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-1 min-w-[52px] min-h-11 py-1 rounded-xl transition-all duration-200 ease-out ${
                  isActive ? 'text-[#D4A574]' : 'text-[#9B9287] active:text-[#F0EAE0]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={21} strokeWidth={isActive ? 1.9 : 1.6} aria-hidden="true" />
                  <span className="text-[10px] tracking-[0.01em] leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
