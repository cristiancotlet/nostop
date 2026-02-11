'use client';

import { useParams } from 'next/navigation';
import StrategyDetail from '@/components/StrategyDetail';

export default function StrategyDetailPage() {
  const params = useParams();

  return (
    <div className="space-y-6">
      {params.id && <StrategyDetail strategyId={params.id as string} />}
    </div>
  );
}
