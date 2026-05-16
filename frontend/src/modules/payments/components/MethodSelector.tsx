// Selector de metodo de pago con tarjetas grandes + iconos.

import {
  DeviceMobile,
  ArrowsLeftRight,
  Money,
  CurrencyDollar,
  CreditCard,
  Storefront,
  Bank,
  Globe,
  CircleDashed,
  type IconProps,
} from '@phosphor-icons/react';
import type { ComponentType } from 'react';
import type { PaymentMethod } from '../api/payments.api';
import { METHOD_LABELS, PAYMENT_METHODS_ORDERED } from '../lib/labels';
import { cn } from '../../../shared/lib/cn';

const METHOD_ICON: Record<PaymentMethod, ComponentType<IconProps>> = {
  pago_movil: DeviceMobile,
  transferencia: ArrowsLeftRight,
  efectivo_bs: Money,
  efectivo_usd: CurrencyDollar,
  efectivo: Money,
  zelle: Bank,
  punto_venta: Storefront,
  tarjeta: CreditCard,
  paypal: Globe,
  otro: CircleDashed,
};

interface Props {
  value: PaymentMethod | null;
  onChange: (method: PaymentMethod) => void;
}

export function MethodSelector({ value, onChange }: Props) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
      {PAYMENT_METHODS_ORDERED.map((m) => {
        const Icon = METHOD_ICON[m];
        const selected = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 px-2 py-3 text-xs font-bold transition-all',
              selected
                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                : 'border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
            aria-pressed={selected}
          >
            <Icon size={22} weight={selected ? 'duotone' : 'regular'} />
            <span className="text-center leading-tight">{METHOD_LABELS[m]}</span>
          </button>
        );
      })}
    </div>
  );
}
