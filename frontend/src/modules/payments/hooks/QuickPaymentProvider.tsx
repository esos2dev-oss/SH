// Provider global del dialogo rapido de pagos.
// Expone open(initial?) para invocar desde cualquier componente, el atajo P,
// y un boton flotante FAB con label.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Plus, CurrencyCircleDollar } from '@phosphor-icons/react';
import { useAuth, type Role } from '../../../contexts/AuthContext';
import { PaymentQuickDialog, type QuickPaymentInitial } from '../components/PaymentQuickDialog';

interface ContextValue {
  open: (initial?: QuickPaymentInitial) => void;
  close: () => void;
  isOpen: boolean;
}

const QuickPaymentContext = createContext<ContextValue | null>(null);

const ALLOWED_ROLES: ReadonlySet<Role> = new Set(['superadmin', 'admin', 'recepcion', 'contabilidad']);

interface ProviderProps {
  children: ReactNode;
}

export function QuickPaymentProvider({ children }: ProviderProps) {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [initial, setInitial] = useState<QuickPaymentInitial | undefined>(undefined);
  const [reloadKey, setReloadKey] = useState(0);

  const canAccess = !!user && ALLOWED_ROLES.has(user.role);

  const open = useCallback((init?: QuickPaymentInitial) => {
    if (!canAccess) return;
    setInitial(init);
    setIsOpen(true);
  }, [canAccess]);

  const close = useCallback(() => setIsOpen(false), []);

  // Atajo global P (mayuscula o minuscula). Ignorar si hay input/textarea con foco.
  useEffect(() => {
    if (!canAccess) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'p' && e.key !== 'P') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return;
      }
      e.preventDefault();
      open();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canAccess, open]);

  return (
    <QuickPaymentContext.Provider value={{ open, close, isOpen }}>
      {children}
      {canAccess && (
        <>
          <PaymentsFab onClick={() => open()} />
          <PaymentQuickDialog
            open={isOpen}
            onOpenChange={setIsOpen}
            {...(initial && { initial })}
            onSaved={() => setReloadKey((k) => k + 1)}
          />
          {/* reloadKey se expone via useQuickPaymentReload */}
          <ReloadKeyBeacon value={reloadKey} />
        </>
      )}
    </QuickPaymentContext.Provider>
  );
}

export function useQuickPayment(): ContextValue {
  const ctx = useContext(QuickPaymentContext);
  if (!ctx) throw new Error('useQuickPayment debe usarse dentro de <QuickPaymentProvider>');
  return ctx;
}

// -------------------------------------------------------------------------

const reloadListeners = new Set<() => void>();

function ReloadKeyBeacon({ value }: { value: number }) {
  useEffect(() => {
    if (value === 0) return;
    reloadListeners.forEach((fn) => fn());
  }, [value]);
  return null;
}

/** Hook para que listas/estados de cuenta se refresquen cuando se guarda un pago global. */
export function useOnPaymentSaved(callback: () => void) {
  useEffect(() => {
    reloadListeners.add(callback);
    return () => { reloadListeners.delete(callback); };
  }, [callback]);
}

// -------------------------------------------------------------------------

interface FabProps {
  onClick: () => void;
}

function PaymentsFab({ onClick }: FabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed z-30 bottom-5 right-5 lg:bottom-6 lg:right-6 inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-4 py-3 shadow-lg hover:shadow-xl hover:scale-105 transition-all font-bold text-sm group"
      title="Registrar pago rapido (tecla P)"
    >
      <CurrencyCircleDollar size={18} weight="duotone" />
      <span className="hidden sm:inline">Registrar pago</span>
      <span className="hidden sm:inline-flex items-center justify-center bg-primary-foreground/20 rounded px-1.5 text-[10px] font-mono font-bold">
        P
      </span>
      <Plus size={14} weight="bold" className="sm:hidden" />
    </button>
  );
}
