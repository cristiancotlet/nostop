'use client';

import { useParams } from 'next/navigation';
import StrategyEditor from '@/components/StrategyEditor';
import { PageLayout } from '@/components/layout/PageLayout';

export default function EditStrategyPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <PageLayout title="Edit">
      <div className="max-w-4xl">
        <StrategyEditor strategyId={id} />
      </div>
    </PageLayout>
  );
}
