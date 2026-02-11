'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SidebarTrigger } from '@/components/ui/sidebar';

const ROUTE_LABELS: Record<string, string> = {
  '': 'Dashboard',
  backtesting: 'Backtesting',
  data: 'Data',
  strategies: 'Strategies',
  signals: 'Signals',
  positions: 'Positions',
  settings: 'Settings',
  new: 'New',
  edit: 'Edit',
};

function getBreadcrumbs(pathname: string): { href: string; label: string }[] {
  const segments = pathname.split('/').filter(Boolean);
  const crumbs: { href: string; label: string }[] = [{ href: '/', label: 'Dashboard' }];

  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    acc += `/${seg}`;
    const label = ROUTE_LABELS[seg] ?? (seg.length === 36 ? 'Detail' : seg.charAt(0).toUpperCase() + seg.slice(1));
    crumbs.push({ href: acc, label });
  }
  return crumbs;
}

export function AppHeader() {
  const pathname = usePathname();
  const crumbs = getBreadcrumbs(pathname);

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4 min-w-0">
      <SidebarTrigger />
      <nav className="flex items-center gap-2 text-sm text-muted-foreground min-w-0">
        {crumbs.map((crumb, i) => (
          <span key={crumb.href} className="flex items-center gap-2 shrink-0">
            {i > 0 && <span className="opacity-50">/</span>}
            {i === crumbs.length - 1 ? (
              <span className="font-medium text-foreground truncate">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="hover:text-foreground transition-colors truncate">
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
