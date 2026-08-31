// Layout autenticado: sidebar fijo + topbar mobile + content.

import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { List, X } from '@phosphor-icons/react';
import { useAuth } from '../contexts/AuthContext';
import { Sidebar } from '../shared/components/layout/Sidebar';
import { QuickPaymentProvider } from '../modules/payments/hooks/QuickPaymentProvider';
import { CommandPaletteProvider } from '../shared/components/command/CommandPaletteProvider';
import { NotificationBell } from '../shared/components/notifications/NotificationBell';
import { DialogProvider } from '../shared/components/ui/dialog-system';
import { APP_NAME, APP_LOGO } from '../shared/lib/brand';
import { SubscriptionBanner } from '../modules/billing/components/SubscriptionBanner';

export function AppLayout() {
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!user) return null;

  return (
    <DialogProvider>
    <QuickPaymentProvider>
    <CommandPaletteProvider>
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
        <div className="ml-3 flex items-center gap-2 flex-1">
          <img src={APP_LOGO} alt={APP_NAME} className="w-8 h-8 rounded-lg object-contain bg-white p-0.5" />
          <span className="font-extrabold text-sm tracking-tight">{APP_NAME}</span>
        </div>
        <NotificationBell />
      </div>

      {/* Desktop top-right notifications */}
      <div className="hidden lg:block fixed top-4 right-4 z-30">
        <NotificationBell />
      </div>

      {/* Mobile overlay sidebar */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative w-64 max-w-[85vw] h-full animate-in slide-in-from-left">
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

      {/* Main content — contenedor centrado con max-w para no estirarse en pantallas anchas */}
      <main role="main" className="lg:ml-64 pt-[72px] lg:pt-0 min-h-screen">
        <SubscriptionBanner />
        <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8 lg:pr-20">
          <Outlet />
        </div>
      </main>
    </div>
    </CommandPaletteProvider>
    </QuickPaymentProvider>
    </DialogProvider>
  );
}
