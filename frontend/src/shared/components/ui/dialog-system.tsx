// Sistema global de dialogs propios: reemplaza window.confirm y window.prompt
// con UI consistente. Devuelven Promises asi que el codigo cliente puede usar
// await sin saber detalles de React.
//
// Uso:
//   const dialog = useDialog();
//   if (await dialog.confirm({ title: 'Eliminar?', message: '...' })) { ... }
//   const reason = await dialog.prompt({ title: 'Motivo', placeholder: '...' });

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode, type FormEvent } from 'react';
import { WarningCircle, Question } from '@phosphor-icons/react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';
import { Button } from './button';
import { Input } from './input';
import { Textarea } from './textarea';
import { cn } from '../../lib/cn';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  multiline?: boolean;
  required?: boolean;
  maxLength?: number;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface DialogApi {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

const DialogContext = createContext<DialogApi | null>(null);

type State =
  | { kind: 'idle' }
  | { kind: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void };

interface Props {
  children: ReactNode;
}

export function DialogProvider({ children }: Props) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ kind: 'confirm', opts, resolve });
    });
  }, []);

  const promptFn = useCallback((opts: PromptOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setState({ kind: 'prompt', opts, resolve });
    });
  }, []);

  function handleClose(value: boolean | string | null) {
    if (state.kind === 'confirm') {
      state.resolve(value === true);
    } else if (state.kind === 'prompt') {
      state.resolve(typeof value === 'string' ? value : null);
    }
    setState({ kind: 'idle' });
  }

  return (
    <DialogContext.Provider value={{ confirm, prompt: promptFn }}>
      {children}

      <Dialog
        open={state.kind === 'confirm'}
        onOpenChange={(open) => { if (!open && state.kind === 'confirm') handleClose(false); }}
      >
        {state.kind === 'confirm' && <ConfirmBody opts={state.opts} onClose={handleClose} />}
      </Dialog>

      <Dialog
        open={state.kind === 'prompt'}
        onOpenChange={(open) => { if (!open && state.kind === 'prompt') handleClose(null); }}
      >
        {state.kind === 'prompt' && <PromptBody opts={state.opts} onClose={handleClose} />}
      </Dialog>
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogApi {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog debe usarse dentro de <DialogProvider>');
  return ctx;
}

// =============================================================================

function ConfirmBody({ opts, onClose }: { opts: ConfirmOptions; onClose: (v: boolean) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <DialogContent className="sm:max-w-md" hideCloseButton>
      <DialogHeader>
        <div className="flex items-start gap-3">
          <div className={cn(
            'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
            opts.danger ? 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400' : 'bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400',
          )}>
            {opts.danger ? <WarningCircle size={20} weight="duotone" /> : <Question size={20} weight="duotone" />}
          </div>
          <div className="flex-1 min-w-0">
            <DialogTitle>{opts.title}</DialogTitle>
            {opts.message && <DialogDescription className="mt-1.5">{opts.message}</DialogDescription>}
          </div>
        </div>
      </DialogHeader>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onClose(false)}>
          {opts.cancelLabel ?? 'Cancelar'}
        </Button>
        <Button
          ref={ref}
          type="button"
          onClick={() => onClose(true)}
          variant={opts.danger ? 'destructive' : 'default'}
        >
          {opts.confirmLabel ?? 'Confirmar'}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function PromptBody({ opts, onClose }: { opts: PromptOptions; onClose: (v: string | null) => void }) {
  const [value, setValue] = useState(opts.defaultValue ?? '');
  const ref = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setTimeout(() => ref.current?.focus(), 50);
  }, []);

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmed = value.trim();
    if (opts.required && trimmed.length === 0) return;
    onClose(trimmed.length === 0 ? '' : value);
  }

  return (
    <DialogContent className="sm:max-w-md" hideCloseButton>
      <form onSubmit={submit}>
        <DialogHeader>
          <DialogTitle>{opts.title}</DialogTitle>
          {opts.message && <DialogDescription className="mt-1">{opts.message}</DialogDescription>}
        </DialogHeader>

        <div className="my-4">
          {opts.multiline ? (
            <Textarea
              ref={(el) => { ref.current = el; }}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={opts.placeholder}
              maxLength={opts.maxLength}
              rows={4}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  submit(e as unknown as FormEvent<HTMLFormElement>);
                }
              }}
            />
          ) : (
            <Input
              ref={(el) => { ref.current = el; }}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={opts.placeholder}
              maxLength={opts.maxLength}
            />
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onClose(null)}>
            {opts.cancelLabel ?? 'Cancelar'}
          </Button>
          <Button type="submit" disabled={opts.required && value.trim().length === 0}>
            {opts.confirmLabel ?? 'Aceptar'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
