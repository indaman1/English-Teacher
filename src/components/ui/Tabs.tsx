import { cn } from '@/lib/utils';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

interface TabsProps<T extends string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Tabs<T extends string>({ items, value, onChange, label }: TabsProps<T>) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            aria-selected={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              'whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium transition',
              selected ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900',
            )}
          >
            {item.label}
            {item.count !== undefined && <span className="ml-1.5 text-xs text-slate-400">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
