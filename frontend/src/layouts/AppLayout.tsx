// Layout autenticado: sidebar fijo + topbar mobile + content.

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { List, X, Bed } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../shared/components/layout/Sidebar';

export function AppLayout() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile topbar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border flex items-center px-4 z-30">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Abrir menu"
          className="p-2 rounded-xl hover:bg-muted transition-colors"
        >
          <List size={22} weight="bold" />
        </button>
        <div className="ml-3 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
            <Bed size={14} weight="bold" />
          </div>
          <span className="font-extrabold text-sm tracking-tight">Sistema Hotelero</span>
        </div>
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-64 h-full">
            <Sidebar onNavigate={() => setMobileOpen(false)} />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Cerrar menu"
              className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <main role="main" className="lg:ml-64 p-4 pt-[72px] lg:p-6 lg:pt-6 xl:p-8">
        <Outlet />
      </main>
    </div>
  );
}
