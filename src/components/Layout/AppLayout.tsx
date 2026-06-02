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
  { to: '/thoughts', icon: MessageCircleHeart, label: 'Pensées' },
  { to: '/calendar', icon: Calendar, label: 'Agenda' },
  { to: '/memories', icon: Camera, label: 'Souvenirs' },
  { to: '/todos', icon: ListTodo, label: 'Projets' },
  { to: '/activities', icon: Heart, label: 'Activités' },
  { to: '/settings', icon: Settings, label: 'Réglages' },
]

export default function AppLayout() {
  return (
    <div className="flex min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-[232px] bg-surface/80 backdrop-blur-2xl shrink-0 fixed h-dvh z-40">
        {/* Subtle right edge separator */}
        <div className="absolute right-0 top-0 bottom-0 w-px bg-white/[0.04]" />

        {/* Brand header */}
        <div className="px-6 pt-8 pb-6">
          <div className="flex items-center gap-3">
            <Heart size={18} className="text-primary/80" fill="currentColor" />
            <span className="text-[15px] font-semibold text-text tracking-tight">
              Nous Deux
            </span>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'text-text font-medium bg-white/[0.05]'
                    : 'text-text-muted hover:text-text/80 hover:bg-white/[0.03]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {/* Left accent bar for active state */}
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-full bg-primary/70" />
                  )}
                  <Icon
                    size={16}
                    className={`shrink-0 transition-colors duration-200 ${
                      isActive ? 'text-primary/80' : ''
                    }`}
                  />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-5">
          <p className="text-[10px] text-text-dim/60 text-center tracking-wide">
            Fait avec <span className="text-primary/50">&#9829;</span> pour vous deux
          </p>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-[232px] pb-20 md:pb-6 overflow-y-auto">
        <AmbientMood>
          <Outlet />
        </AmbientMood>
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        {/* Top edge line */}
        <div className="h-px bg-white/[0.06]" />
        <div className="bg-surface/95 backdrop-blur-2xl">
          <div className="flex justify-around items-center px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {NAV_ITEMS.slice(0, 5).map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  `flex flex-col items-center gap-1 px-3 py-1 text-[10px] tracking-wide transition-all duration-200 ease-in-out ${
                    isActive
                      ? 'text-text font-medium'
                      : 'text-text-dim active:text-text-muted'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      size={20}
                      strokeWidth={isActive ? 2 : 1.5}
                      className={`transition-colors duration-200 ${
                        isActive ? 'text-primary/90' : ''
                      }`}
                    />
                    <span>{label}</span>
                    {/* Active dot indicator */}
                    <div
                      className={`w-1 h-1 rounded-full transition-all duration-300 ease-in-out ${
                        isActive ? 'bg-primary/70 scale-100' : 'bg-transparent scale-0'
                      }`}
                    />
                  </>
                )}
              </NavLink>
            ))}
            <NavLink
              to="/settings"
              end
              className={({ isActive }) =>
                `flex flex-col items-center gap-1 px-3 py-1 text-[10px] tracking-wide transition-all duration-200 ease-in-out ${
                  isActive
                    ? 'text-text font-medium'
                    : 'text-text-dim active:text-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Settings
                    size={20}
                    strokeWidth={isActive ? 2 : 1.5}
                    className={`transition-colors duration-200 ${
                      isActive ? 'text-primary/90' : ''
                    }`}
                  />
                  <span>Plus</span>
                  <div
                    className={`w-1 h-1 rounded-full transition-all duration-300 ease-in-out ${
                      isActive ? 'bg-primary/70 scale-100' : 'bg-transparent scale-0'
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
