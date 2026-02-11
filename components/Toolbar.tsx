import { cn } from '@/lib/utils';

interface ToolbarProps {
  left?: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}

export function Toolbar({ left, right, className }: ToolbarProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 flex-wrap',
        className
      )}
    >
      {left && <div>{left}</div>}
      {right && <div className="ml-auto">{right}</div>}
    </div>
  );
}
