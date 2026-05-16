// Wrapper minimal sobre <select> nativo con estilos coherentes.
// No usa Radix porque @radix-ui/react-select no esta instalado.

import * as React from 'react';
import { cn } from '../../lib/cn';

export interface SelectNativeProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const SelectNative = React.forwardRef<HTMLSelectElement, SelectNativeProps>(({ className, children, ...props }, ref) => {
  return (
    <select
      ref={ref}
      className={cn(
        'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
});
SelectNative.displayName = 'SelectNative';
