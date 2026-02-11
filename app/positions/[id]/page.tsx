'use client';

import { useParams } from 'next/navigation';
import PositionDetail from '@/components/PositionDetail';

export default function PositionDetailPage() {
  const params = useParams();

  return (
    <div className="w-full">
      {params.id && <PositionDetail positionId={params.id as string} />}
    </div>
  );
}
