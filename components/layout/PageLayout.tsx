interface PageLayoutProps {
  title: string;
  /** Actions inline with title (Add New, Import, etc.) */
  actions?: React.ReactNode;
  /** Search/filters row below the header. Rendered only when provided. */
  filters?: React.ReactNode;
  /** @deprecated Use actions instead. Kept for backward compatibility. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}

export function PageLayout({ title, actions, filters, toolbar, children }: PageLayoutProps) {
  const headerActions = actions ?? toolbar;
  return (
    <div className="flex flex-col gap-6">
      {/* Row 1: Title | Actions */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {headerActions}
      </div>
      {/* Row 2: Search/Filters (optional) */}
      {filters && (
        <div className="flex flex-wrap items-end gap-4">
          {filters}
        </div>
      )}
      {/* Row 3: Main content (list, etc.) */}
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
