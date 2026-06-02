import { NavLink, Outlet } from 'react-router-dom'
import {
  Home,
  MessageCircleHeart,
  Calendar,
  Camera,
  ListTodo,
  Heart,
  Settings,
} from 'lucide-react'
import AmbientMood from '@/components/AmbientMood'

const NAV_ITEMS = [
  { to: '/', icon: Home, label: 'Accueil' },
  { to: '/thoughts', icon: MessageCircleHeart, label: 'Pensees' },
  { to: '/calendar', icon: Calendar, label: 'Agenda' },
  { to: '/memories', icon: Camera, label: 'Souvenirs' },
  { to: '/todos', icon: ListTodo, label: 'Projets' },
  { to: '/activities', icon: Heart, label: 'Activites' },
  { to: '/settings', icon: Settings, label: 'Reglages' },
]

export default function AppLayout() {
  return (
    <div className="flex min-h-dvh bg-[#110F0E]">
      {/* ─── Desktop sidebar ─── */}
      <nav className="hidden md:flex flex-col w-[232px] bg-[#161411]/90 backdrop-blur-2xl shrink-0 fixed h-dvh z-40">
        {/* Single 1px right edge */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-[rgba(212,165,116,0.04)]" />

        {/* Brand mark */}
        <div className="px-6 pt-8 pb-8">
          <div className="flex items-center gap-3">
            <Heart
              size={17}
              className="text-[#D4A574]/50 transition-opacity duration-500"
              fill="currentColor"
            />
            <span className="text-[15px] font-light text-[#F0EAE0]/90 tracking-tight">
              Nous Deux
            </span>
          </div>
        </div>

        {/* Nav items — text-only, no backgrounds */}
        <div className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-thin scrollbar-thumb-[rgba(212,165,116,0.08)] scrollbar-track-transparent">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `group relative flex items-center gap-3 px-4 py-2.5 text-[13px] tracking-wide transition-all duration-300 ease-out ${
                  isActive
                    ? 'text-[#F0EAE0] font-medium'
                    : 'text-[#6B6359] hover:text-[#9B9287]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* 2px left accent bar — animates from center outward */}
                  <div
                    className={`absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full bg-[#D4A574] transition-all duration-300 ease-out ${
                      isActive ? 'h-4 opacity-100' : 'h-0 opacity-0'
                    }`}
                  />
                  <Icon
                    size={16}
                    strokeWidth={isActive ? 1.8 : 1.5}
                    className={`shrink-0 transition-all duration-300 ease-out ${
                      isActive ? 'text-[#D4A574]/80' : 'text-[#6B6359] group-hover:text-[#9B9287]'
                    }`}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer — fades to near-invisible */}
        <div className="px-6 py-5">
          <p className="text-[10px] text-[#6B6359]/40 text-center tracking-widest">
            Fait avec <span className="text-[#D4A574]/30">&#9829;</span> pour vous deux
          </p>
        </div>
      </nav>

      {/* ─── Main content ─── */}
      <main className="flex-1 md:ml-[232px] pb-24 md:pb-6 overflow-y-auto">
        <AmbientMood>
          <Outlet />
        </AmbientMood>
      </main>

      {/* ─── Mobile bottom nav ─── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        {/* Top edge — single 1px warm line */}
        <div className="h-px bg-[rgba(212,165,116,0.04)]" />
        <div className="bg-[#161411]/95 backdrop-blur-2xl">
          <div className="flex justify-around items-center px-2 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
            {NAV_ITEMS.slice(0, 5).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 min-w-[48px] py-1 transition-all duration-300 ease-out ${
                    isActive
                      ? 'text-[#D4A574]'
                      : 'text-[#6B6359] active:text-[#9B9287]'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 1.8 : 1.5}
                      className={`transition-all duration-300 ease-out ${
                        isActive ? 'text-[#D4A574]' : ''
                      }`}
                    />
                    <span className="text-[10px] tracking-wide leading-none">{label}</span>
                    {/* 3px active dot below label */}
                    <div
                      className={`w-[3px] h-[3px] rounded-full transition-all duration-300 ease-out ${
                        isActive
                          ? 'bg-[#D4A574] scale-100 opacity-100'
                          : 'bg-transparent scale-0 opacity-0'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
            {/* Overflow / Settings tab */}
            <NavLink
              to="/settings"
              end
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 min-w-[48px] py-1 transition-all duration-300 ease-out ${
                  isActive
                    ? 'text-[#D4A574]'
                    : 'text-[#6B6359] active:text-[#9B9287]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Settings
                    size={20}
                    strokeWidth={isActive ? 1.8 : 1.5}
                    className={`transition-all duration-300 ease-out ${
                      isActive ? 'text-[#D4A574]' : ''
                    }`}
                  />
                  <span className="text-[10px] tracking-wide leading-none">Plus</span>
                  <div
                    className={`w-[3px] h-[3px] rounded-full transition-all duration-300 ease-out ${
                      isActive
                        ? 'bg-[#D4A574] scale-100 opacity-100'
                        : 'bg-transparent scale-0 opacity-0'
                    }`}
                  />
                </>
              )}
            </NavLink>
          </div>
        </div>
      </nav>
    </div>
  )
}
