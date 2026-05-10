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
      <nav className="hidden md:flex flex-col w-60 bg-gradient-to-b from-surface to-surface/95 border-r border-surface-lighter/50 shrink-0 fixed h-dvh z-40 backdrop-blur-xl">
        {/* Brand header */}
        <div className="p-6 border-b border-surface-lighter/50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary/25 to-secondary/15 border border-primary/20 flex items-center justify-center">
              <Heart size={18} className="text-primary" fill="currentColor" />
            </div>
            <h1 className="text-lg font-extrabold gradient-text tracking-tight">Nous Deux</h1>
          </div>
        </div>

        {/* Nav items */}
        <div className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                  isActive
                    ? 'bg-gradient-to-r from-primary/15 to-primary/5 text-primary shadow-sm shadow-primary/5'
                    : 'text-text-muted hover:text-text hover:bg-surface-lighter/50'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? 'bg-primary/15'
                      : 'group-hover:bg-surface-lighter'
                  }`}>
                    <Icon size={17} />
                  </div>
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-lighter/50">
          <p className="text-[10px] text-text-dim text-center">Fait avec 💜 pour vous deux</p>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-60 pb-20 md:pb-6 overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/90 backdrop-blur-2xl border-t border-surface-lighter/30 z-40">
        <div className="flex justify-around items-center px-1 py-1">
          {NAV_ITEMS.slice(0, 5).map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-[10px] font-medium transition-all ${
                  isActive
                    ? 'text-primary'
                    : 'text-text-dim active:text-text-muted'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-primary/15' : ''}`}>
                    <Icon size={20} />
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-2 rounded-xl text-[10px] font-medium transition-all ${
                isActive
                  ? 'text-primary'
                  : 'text-text-dim active:text-text-muted'
              }`
            }
          >
            {({ isActive }) => (
              <>
                <div className={`p-1.5 rounded-xl transition-all ${isActive ? 'bg-primary/15' : ''}`}>
                  <Settings size={20} />
                </div>
                <span>Plus</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
