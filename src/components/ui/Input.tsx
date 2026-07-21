import { InputHTMLAttributes, forwardRef } from 'react';
import { cn } from '@/lib/utils/format';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, id, ...props }, ref) => {
    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label htmlFor={id} className="text-sm font-medium text-paper/70">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={id}
          className={cn(
            'w-full rounded-lg border border-ink-border bg-ink-raised px-3.5 py-2.5 text-paper placeholder:text-paper/30',
            'focus:outline-none focus:ring-2 focus:ring-mint/60 focus:border-mint/60',
            error && 'border-peach focus:ring-peach/60',
            className
          )}
          {...props}
        />
        {error && <span className="text-sm text-peach">{error}</span>}
      </div>
    );
  }
);
Input.displayName = 'Input';
