import StrategyEditor from '@/components/StrategyEditor';
import { PageLayout } from '@/components/layout/PageLayout';

export default function NewStrategyPage() {
  return (
    <PageLayout title="Add New">
      <div className="max-w-4xl">
        <StrategyEditor />
      </div>
    </PageLayout>
  );
}
