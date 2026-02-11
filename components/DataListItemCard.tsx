import Link from 'next/link';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

export interface DataListItemCardProps {
  title: string;
  subtitle?: string;
  metadata?: { label: string; value: string }[];
  description?: string;
  href?: string;
  badges?: { label: string; variant?: BadgeVariant }[];
  actions?: React.ReactNode;
  trailing?: React.ReactNode;
  children?: React.ReactNode;
}

export function DataListItemCard({
  title,
  subtitle,
  metadata,
  description,
  href,
  badges,
  actions,
  trailing,
  children,
}: DataListItemCardProps) {
  const content = (
    <>
      <CardHeader className="pb-2">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">{title}</CardTitle>
                {badges && badges.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {badges.map((b) => (
                      <Badge key={b.label} variant={b.variant ?? 'secondary'} className="text-xs">
                        {b.label}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {subtitle && (
                <p className="text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {trailing && <div className="shrink-0">{trailing}</div>}
          </div>
        </div>
      </CardHeader>
      {(metadata || description || children) && (
        <CardContent className="space-y-1 text-sm text-muted-foreground pt-0">
          {metadata && metadata.length > 0 && (
            <div className="space-y-1">
              {metadata.map((m) => (
                <p key={m.label}>
                  {m.label}: {m.value}
                </p>
              ))}
            </div>
          )}
          {description && <p className="line-clamp-2">{description}</p>}
          {children}
        </CardContent>
      )}
      {actions && (
        <CardFooter className="gap-2 pt-2">
          {actions}
        </CardFooter>
      )}
    </>
  );

  const cardClassName = cn(
    href && 'hover:bg-accent/50 transition-colors cursor-pointer'
  );

  if (href) {
    return (
      <Link href={href} className="block">
        <Card className={cardClassName}>{content}</Card>
      </Link>
    );
  }

  return <Card className={cardClassName}>{content}</Card>;
}
