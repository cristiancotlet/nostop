'use client';

import { useState, useEffect } from 'react';
import { DataListItemCard } from '@/components/DataListItemCard';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/layout/PageLayout';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

interface PositionLog {
  ticksPnL: number | null;
}

interface Position {
  id: string;
  status: 'OPEN' | 'CLOSED';
  entryConfirmedAt: string | null;
  exitConfirmedAt: string | null;
  currentCandleCount: number;
  signal: {
    id: string;
    instrument: string;
    timeframe: string;
    signal: 'BUY' | 'SELL' | 'HOLD';
    strategy: { name: string };
  };
  positionLogs: PositionLog[];
}

export default function PositionDashboard() {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'OPEN' | 'CLOSED'>('ALL');

  useEffect(() => {
    fetchPositions();
  }, [filter]);

  const fetchPositions = async () => {
    try {
      const params = filter !== 'ALL' ? `?status=${filter}` : '';
      const response = await fetch(`/api/positions${params}`);
      const data = await response.json();
      if (data.success) {
        setPositions(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFinalTicksPnL = (position: Position): number | null => {
    if (position.positionLogs.length === 0) return null;
    return position.positionLogs[position.positionLogs.length - 1]?.ticksPnL ?? null;
  };

  const getMaxDrawdownTicks = (position: Position): number | null => {
    if (position.positionLogs.length === 0) return null;
    const minPnL = Math.min(...position.positionLogs.map((l) => l.ticksPnL ?? 0));
    return minPnL < 0 ? -minPnL : 0;
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading positions...
      </div>
    );
  }

  return (
    <PageLayout
      title="Positions"
      filters={
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select value={filter} onValueChange={(v) => setFilter(v as 'ALL' | 'OPEN' | 'CLOSED')}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="OPEN">Open</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
      }
    >
      {positions.length === 0 ? (
        <EmptyState
          title="No positions found. Create a position from a signal or save one from backtesting."
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {positions.map((position) => {
            const ticksPnL = getFinalTicksPnL(position);
            const maxDrawdown = getMaxDrawdownTicks(position);
            const isProfit = ticksPnL != null && ticksPnL > 0;
            const isLoss = ticksPnL != null && ticksPnL < 0;

            const signalBadgeVariant = position.signal.signal === 'BUY' ? 'default' : position.signal.signal === 'SELL' ? 'destructive' : 'secondary';

            return (
              <DataListItemCard
                key={position.id}
                title={position.signal.instrument}
                subtitle={position.signal.timeframe}
                href={`/positions/${position.id}`}
                badges={[
                  { label: position.signal.signal, variant: signalBadgeVariant },
                  { label: position.status, variant: 'secondary' },
                ]}
                metadata={[
                  { label: 'Entry', value: formatDate(position.entryConfirmedAt) },
                  { label: 'Candles', value: `${position.currentCandleCount}` },
                  { label: 'Strategy', value: position.signal.strategy.name },
                  ...(maxDrawdown != null ? [{ label: 'Max DD', value: `${maxDrawdown} ticks` }] : []),
                ]}
                trailing={
                  position.status === 'CLOSED' && ticksPnL != null ? (
                    <span
                      className={cn(
                        'text-sm font-semibold tabular-nums',
                        isProfit && 'text-green-600 dark:text-green-400',
                        isLoss && 'text-red-600 dark:text-red-400',
                        ticksPnL === 0 && 'text-muted-foreground'
                      )}
                    >
                      {ticksPnL >= 0 ? '+' : ''}{ticksPnL} ticks
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )
                }
              />
            );
          })}
        </div>
      )}
    </PageLayout>
  );
}
