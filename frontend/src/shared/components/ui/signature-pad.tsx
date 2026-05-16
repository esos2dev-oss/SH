// Canvas para capturar firma con mouse, touch o pen.
// Devuelve un Blob (PNG) cuando se exporta. Sin libreria externa.

import { useCallback, useEffect, useRef, useState, type PointerEvent } from 'react';
import { Eraser, Pen, FloppyDisk, Check } from '@phosphor-icons/react';
import { Button } from './button';
import { cn } from '../../lib/cn';

interface Props {
  width?: number;
  height?: number;
  /** Llamado cuando el usuario confirma la firma. */
  onSave: (blob: Blob) => Promise<void> | void;
  /** Texto del boton de guardar. Default: "Guardar firma". */
  saveLabel?: string;
  /** Si true, el componente queda visualmente confirmado tras guardar. */
  confirmAfterSave?: boolean;
  disabled?: boolean;
}

export function SignaturePad({
  width = 600,
  height = 200,
  onSave,
  saveLabel = 'Guardar firma',
  confirmAfterSave = true,
  disabled,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);
  const [hasContent, setHasContent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const getCtx = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    return canvas.getContext('2d');
  }, []);

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    setupCanvas();
    const onResize = () => setupCanvas();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [setupCanvas]);

  function pointerPos(e: PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    if (disabled || saved) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    drawing.current = true;
    lastPoint.current = pointerPos(e);
  }
  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled || saved) return;
    const ctx = getCtx();
    if (!ctx) return;
    const cur = pointerPos(e);
    const prev = lastPoint.current ?? cur;
    ctx.beginPath();
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(cur.x, cur.y);
    ctx.stroke();
    lastPoint.current = cur;
    if (!hasContent) setHasContent(true);
  }
  function onPointerUp() {
    drawing.current = false;
    lastPoint.current = null;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = getCtx();
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    setSaved(false);
  }

  async function handleSave() {
    const canvas = canvasRef.current;
    if (!canvas || !hasContent) return;
    setSaving(true);
    try {
      const blob: Blob = await new Promise((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo exportar la firma'))), 'image/png');
      });
      await onSave(blob);
      if (confirmAfterSave) setSaved(true);
    } finally { setSaving(false); }
  }

  return (
    <div className={cn('rounded-xl border border-border bg-card overflow-hidden', saved && 'border-emerald-300 dark:border-emerald-800')}>
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
        <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground">
          <Pen size={12} weight="duotone" />
          {saved ? 'Firma guardada' : 'Firma del huesped'}
        </div>
        {!saved && (
          <button
            type="button"
            onClick={clear}
            disabled={!hasContent || disabled}
            className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-40"
          >
            <Eraser size={11} weight="bold" /> Limpiar
          </button>
        )}
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: `${height}px`, maxWidth: `${width}px`, touchAction: 'none' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={onPointerUp}
        className={cn(
          'block w-full cursor-crosshair bg-white',
          saved && 'cursor-default opacity-70',
        )}
      />
      <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-border bg-muted/30">
        {saved ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-bold">
            <Check size={12} weight="bold" /> Firmado
          </span>
        ) : (
          <Button
            type="button"
            size="sm"
            onClick={() => void handleSave()}
            disabled={!hasContent || saving || disabled}
          >
            <FloppyDisk size={12} weight="bold" className="mr-1" />
            {saving ? 'Guardando...' : saveLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
