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
    <div className="flex min-h-dvh">
      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col w-56 bg-surface border-r border-surface-lighter shrink-0 fixed h-dvh z-40">
        <div className="p-5 border-b border-surface-lighter">
          <h1 className="text-lg font-bold gradient-text">Nous Deux</h1>
        </div>
        <div className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {NAV_ITEMS.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary/15 text-primary'
                    : 'text-text-muted hover:text-text hover:bg-surface-lighter'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 md:ml-56 pb-20 md:pb-6 overflow-y-auto">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface/95 backdrop-blur-lg border-t border-surface-lighter z-40">
        <div className="flex justify-around items-center px-1 py-1.5">
          {NAV_ITEMS.slice(0, 5).map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] transition-all ${
                  isActive ? 'text-primary' : 'text-text-muted'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/settings"
            end
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl text-[10px] transition-all ${
                isActive ? 'text-primary' : 'text-text-muted'
              }`
            }
          >
            <Settings size={20} />
            Plus
          </NavLink>
        </div>
      </nav>
    </div>
  )
}
