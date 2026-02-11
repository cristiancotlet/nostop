import { cn } from '@/lib/utils';

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
  variant?: 'grid' | 'inline';
}

export function FilterBar({ children, className, variant = 'grid' }: FilterBarProps) {
  return (
    <div
      className={cn(
        variant === 'inline'
          ? 'flex flex-wrap items-end gap-4'
          : 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4',
        className
      )}
    >
      {children}
    </div>
  );
}
