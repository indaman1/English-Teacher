import { forwardRef, useId, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const fieldBase =
  'w-full rounded-xl border bg-white px-3.5 text-[15px] text-slate-900 shadow-sm transition placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-200 disabled:bg-slate-50 disabled:text-slate-500';

interface FieldProps {
  label?: string;
  hint?: string;
  error?: string | null;
}

function Field({ id, label, hint, error, children }: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-slate-700">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & FieldProps>(function Input(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <input
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : undefined}
        className={cn(fieldBase, 'h-11', error ? 'border-rose-400' : 'border-slate-200', className)}
        {...rest}
      />
    </Field>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & FieldProps>(function Textarea(
  { label, hint, error, className, id, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <textarea
        ref={ref}
        id={fieldId}
        aria-invalid={error ? true : undefined}
        className={cn(fieldBase, 'min-h-24 py-2.5', error ? 'border-rose-400' : 'border-slate-200', className)}
        {...rest}
      />
    </Field>
  );
});

/** Native select styled as a dropdown: best accessibility and mobile UX. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement> & FieldProps>(function Select(
  { label, hint, error, className, id, children, ...rest },
  ref,
) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <Field id={fieldId} label={label} hint={hint} error={error}>
      <select
        ref={ref}
        id={fieldId}
        className={cn(fieldBase, 'h-11 appearance-none bg-[url("data:image/svg+xml;utf8,<svg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 20 20%27 fill=%27%2364748b%27><path d=%27M5.5 7.5 10 12l4.5-4.5%27 stroke=%27%2364748b%27 stroke-width=%271.8%27 fill=%27none%27 stroke-linecap=%27round%27/></svg>")] bg-[length:1.25rem] bg-[right_0.6rem_center] bg-no-repeat pr-9', error ? 'border-rose-400' : 'border-slate-200', className)}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
});
