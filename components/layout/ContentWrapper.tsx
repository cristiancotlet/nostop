'use client';

import { usePathname } from 'next/navigation';

interface ContentWrapperProps {
  children: React.ReactNode;
}

/** Wraps page content. Backtesting gets full-bleed (no container); other pages get centered container. */
export function ContentWrapper({ children }: ContentWrapperProps) {
  const pathname = usePathname();
  const isFullWidth = pathname === '/backtesting';

  if (isFullWidth) {
    return <div className="flex-1 min-w-0">{children}</div>;
  }

  return (
    <div className="container mx-auto px-4 py-4 min-w-0">
      {children}
    </div>
  );
}
