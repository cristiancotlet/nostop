interface EmptyStateProps {
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
      <p className="mb-4">{title}</p>
      {description && <p className="mb-4 text-sm">{description}</p>}
      {action}
    </div>
  );
}
