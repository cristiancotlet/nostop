'use client';

import { usePathname } from 'next/navigation';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';
import { ContentWrapper } from '@/components/layout/ContentWrapper';

const PUBLIC_PATHS = ['/login', '/auth/callback', '/setup'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + '/'));
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const showAppShell = !isPublicPath(pathname);

  if (!showAppShell) {
    return <>{children}</>;
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <div className="flex-1 overflow-auto min-w-0">
          <ContentWrapper>{children}</ContentWrapper>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
