// Provider del command palette. Atajos globales: Ctrl/Cmd+K, /, ?, N, etc.
// Se monta dentro de AppLayout.

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { CommandPalette } from './CommandPalette';

interface Ctx {
  open: () => void;
  close: () => void;
  isOpen: boolean;
}

const CommandPaletteContext = createContext<Ctx | null>(null);

interface Props {
  children: ReactNode;
}

export function CommandPaletteProvider({ children }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  // Atajos globales: Ctrl/Cmd+K para palette, "/" para foco al buscador,
  // "?" para mostrar ayuda (mapea al palette tambien).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Si hay foco en input/textarea/contenteditable, solo procesar Cmd/Ctrl+K
      const target = e.target as HTMLElement | null;
      const inField = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable);

      // Ctrl/Cmd+K — abrir palette
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsOpen(true);
        return;
      }
      if (inField) return;

      // "/" — abrir palette (estilo Linear)
      if (e.key === '/') { e.preventDefault(); setIsOpen(true); return; }
      // "?" — abrir palette (helper)
      if (e.key === '?') { e.preventDefault(); setIsOpen(true); return; }
      // "N" — nueva reserva
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); navigate('/bookings?new=1'); return; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  return (
    <CommandPaletteContext.Provider value={{ open, close, isOpen }}>
      {children}
      <CommandPalette open={isOpen} onClose={close} />
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): Ctx {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) throw new Error('useCommandPalette debe usarse dentro de <CommandPaletteProvider>');
  return ctx;
}
