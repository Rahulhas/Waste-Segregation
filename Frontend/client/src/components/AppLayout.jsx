import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Logo, Button } from './ui';


const NAV_ITEMS = [
  // Citizen
  { to: '/citizen', label: 'Citizen Portal', roles: ['USER'] },

  // Software Admin (Sole responsibility: Municipal Admins)
  { to: '/workers', label: 'Municipal Admins Directory', roles: ['SOFTWARE_ADMIN'] },

  // Municipal Admin (Controls city, workers, dispatch, and maps)
  { to: '/admin', label: 'City Analytics & Bins', roles: ['MUNICIPAL_ADMIN', 'ADMIN'] },
  { to: '/dispatch', label: 'City Dispatch & Maps', roles: ['MUNICIPAL_ADMIN', 'ADMIN'] },
  { to: '/workers', label: 'Workers & Drivers', roles: ['MUNICIPAL_ADMIN', 'ADMIN'] },
  { to: '/alerts', label: 'City Alerts', roles: ['MUNICIPAL_ADMIN', 'ADMIN'] },
  { to: '/analyze', label: 'Analyze Waste', roles: ['MUNICIPAL_ADMIN', 'ADMIN'] },

  // Driver
  { to: '/dispatch', label: 'My Route & Dispatch', roles: ['DRIVER'] },
  { to: '/alerts', label: 'Alerts', roles: ['DRIVER'] },
  { to: '/analyze', label: 'Analyze Waste', roles: ['DRIVER'] },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const visibleNav = NAV_ITEMS.filter((item) => item.roles.includes(user?.role));

  function handleLogout() {
    logout();
    navigate('/login');
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-50 border-b border-divider bg-surface/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Logo size="sm" />
            <nav className="hidden items-center gap-1 md:flex">
              {visibleNav.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-sage-50 text-forest'
                        : 'text-text-secondary hover:bg-sage-50 hover:text-forest'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                aria-expanded={profileOpen}
                aria-haspopup="menu"
                aria-label="Open profile menu"
                title="Profile"
                className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border-2 border-sage-300 bg-mint text-sm font-bold text-forest transition-colors hover:border-sage-600"
              >
                {user?.image ? (
                  <img src={user.image} alt="Profile" className="h-full w-full object-cover" />
                ) : (
                  user?.name?.charAt(0).toUpperCase() || '?'
                )}
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full z-[100] mt-3 w-52 rounded-lg border border-divider bg-surface p-2 shadow-lg" role="menu">
                  <div className="border-b border-divider px-3 py-2">
                    <div className="text-sm font-semibold text-text-primary">{user?.name}</div>
                    <div className="truncate text-xs text-text-muted">{user?.email}</div>
                  </div>
                  <Link to="/profile" onClick={() => setProfileOpen(false)} className="mt-1 block rounded-md px-3 py-2 text-sm text-text-secondary hover:bg-sage-50 hover:text-forest" role="menuitem">
                    Edit profile
                  </Link>
                  <Button variant="ghost" onClick={handleLogout} className="w-full justify-start px-3 py-2 text-sm" role="menuitem">
                    Sign out
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}
