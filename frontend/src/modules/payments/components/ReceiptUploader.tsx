// Uploader de captura/comprobante. Soporta:
//  - File picker (click)
//  - Drag & drop
//  - Paste (Ctrl+V) — flujo tipico de capturas de WhatsApp
//
// Sube al backend y devuelve la URL publica del recibo.

import { useEffect, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { toast } from 'sonner';
import { Image, Trash, FilePdf, Spinner } from '@phosphor-icons/react';
import { uploadReceipt } from '../api/payments.api';
import { cn } from '../../../shared/lib/cn';

const ACCEPTED = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

interface Props {
  /** URL ya guardada (modo controlado) */
  value: string | null;
  /** MIME del archivo actual */
  mime?: string | null;
  onChange: (url: string | null, mime: string | null) => void;
  disabled?: boolean;
}

export function ReceiptUploader({ value, mime, onChange, disabled }: Props) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function handleFile(file: File) {
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Archivo muy grande (max 5 MB)');
      return;
    }
    setUploading(true);
    try {
      const r = await uploadReceipt(file);
      onChange(r.url, r.mime);
      toast.success('Captura subida');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'No se pudo subir');
    } finally { setUploading(false); }
  }

  function onPaste(e: ClipboardEvent<HTMLDivElement>) {
    if (disabled || uploading) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]!;
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) {
          e.preventDefault();
          void handleFile(f);
          return;
        }
      }
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled || uploading) return;
    const f = e.dataTransfer.files?.[0];
    if (f) void handleFile(f);
  }

  // Global paste listener: cuando el dialog esta abierto, el paste va a body.
  // Si el target del paste no es un input/textarea, lo capturamos aqui.
  useEffect(() => {
    if (disabled || uploading) return;
    function onWindowPaste(e: globalThis.ClipboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }
      if (!containerRef.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        const it = items[i]!;
        if (it.kind === 'file') {
          const f = it.getAsFile();
          if (f) {
            e.preventDefault();
            void handleFile(f);
            return;
          }
        }
      }
    }
    window.addEventListener('paste', onWindowPaste);
    return () => window.removeEventListener('paste', onWindowPaste);
  }, [disabled, uploading]);

  if (value) {
    const isPdf = mime === 'application/pdf';
    return (
      <div className="relative rounded-lg border border-border bg-muted/20 p-2">
        <div className="flex items-start gap-3">
          {isPdf ? (
            <div className="w-16 h-16 rounded bg-red-50 dark:bg-red-950/30 flex items-center justify-center flex-shrink-0">
              <FilePdf size={26} weight="duotone" className="text-red-600" />
            </div>
          ) : (
            <a href={value} target="_blank" rel="noreferrer" className="block flex-shrink-0">
              <img
                src={value}
                alt="Captura"
                className="w-16 h-16 object-cover rounded border border-border"
              />
            </a>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold truncate">Captura adjunta</p>
            <a href={value} target="_blank" rel="noreferrer" className="text-[11px] text-primary hover:underline">
              Ver
            </a>
          </div>
          <button
            type="button"
            onClick={() => onChange(null, null)}
            disabled={disabled}
            className="p-1.5 rounded hover:bg-red-50 text-red-600 dark:hover:bg-red-950/30"
            title="Quitar captura"
          >
            <Trash size={14} weight="bold" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onPaste={onPaste}
      onDragOver={(e) => { e.preventDefault(); if (!dragOver) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      tabIndex={0}
      className={cn(
        'rounded-lg border-2 border-dashed p-4 text-center transition-colors outline-none focus:border-primary focus:ring-2 focus:ring-ring',
        dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/10 hover:bg-muted/30',
        (disabled || uploading) && 'opacity-60 cursor-not-allowed',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        className="inline-flex flex-col items-center gap-1.5 text-xs"
      >
        {uploading ? (
          <>
            <Spinner size={22} weight="duotone" className="animate-spin text-primary" />
            <span className="font-bold text-primary">Subiendo…</span>
          </>
        ) : (
          <>
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center mb-1">
              <Image size={18} weight="duotone" className="text-primary" />
            </div>
            <span className="font-bold">Adjuntar captura</span>
            <span className="text-[10px] text-muted-foreground">
              <kbd className="px-1 py-0.5 rounded bg-muted text-[9px] font-mono">Ctrl+V</kbd>,{' '}
              arrastra aqui o{' '}
              <span className="text-primary underline-offset-2 hover:underline">elige archivo</span>
            </span>
            <span className="text-[9px] text-muted-foreground mt-1">JPG · PNG · WEBP · PDF — max 5 MB</span>
          </>
        )}
      </button>
    </div>
  );
}
