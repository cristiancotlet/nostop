'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

interface PositionLog {
  id: string;
  candleTimestamp: string;
  conclusion: string;
  ticksPnL: number | null;
  closePrice?: number | null;
  ohlcData?: { timestamp: string; close: number; open?: number; high?: number; low?: number } | null;
}

interface Position {
  id: string;
  status: 'OPEN' | 'CLOSED';
  entryPrice?: number | null;
  entryConfirmedAt: string | null;
  exitConfirmedAt: string | null;
  currentCandleCount: number;
  learningInsights: string | null;
  signal: {
    id: string;
    instrument: string;
    timeframe: string;
    signal: 'BUY' | 'SELL' | 'HOLD';
    reasoning: string;
    strategy: { id: string; name: string };
    ohlcData?: { timestamp: string; open: number; high: number; low: number; close: number } | null;
  };
  positionLogs: PositionLog[];
}

interface PositionDetailProps {
  positionId: string;
}

export default function PositionDetail({ positionId }: PositionDetailProps) {
  const [position, setPosition] = useState<Position | null>(null);
  const [loading, setLoading] = useState(true);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    fetchPosition();
  }, [positionId]);

  useEffect(() => {
    if (position?.status !== 'OPEN') return;
    const interval = setInterval(fetchPosition, 5000);
    return () => clearInterval(interval);
  }, [position?.status]);

  const fetchPosition = async () => {
    try {
      const response = await fetch(`/api/positions/${positionId}`);
      const data = await response.json();
      if (data.success) {
        setPosition(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch position:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExit = async () => {
    if (!confirm('Are you sure you want to exit this position?')) return;
    setExiting(true);
    try {
      const response = await fetch(`/api/positions/${positionId}/exit`, { method: 'POST' });
      const data = await response.json();
      if (response.ok) fetchPosition();
      else alert(data.error || 'Failed to exit position');
    } catch (error) {
      alert('Failed to exit position');
    } finally {
      setExiting(false);
    }
  };

  const formatDateTime = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  const getFinalTicksPnL = () => {
    if (!position?.positionLogs?.length) return null;
    return position.positionLogs[position.positionLogs.length - 1]?.ticksPnL ?? null;
  };

  const getMaxDrawdownTicks = (): number | null => {
    if (!position?.positionLogs?.length) return null;
    const minPnL = Math.min(...position.positionLogs.map((l) => l.ticksPnL ?? 0));
    return minPnL < 0 ? -minPnL : 0;
  };

  const getExitPrice = () => {
    if (position?.status !== 'CLOSED' || !position.positionLogs?.length) return null;
    const last = position.positionLogs[position.positionLogs.length - 1];
    return last?.closePrice ?? last?.ohlcData?.close ?? null;
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading position...
      </div>
    );
  }

  if (!position) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Position not found
      </div>
    );
  }

  const ticksPnL = getFinalTicksPnL();
  const maxDrawdown = getMaxDrawdownTicks();
  const exitPrice = getExitPrice();
  const isProfit = ticksPnL != null && ticksPnL > 0;
  const isLoss = ticksPnL != null && ticksPnL < 0;
  const entryPrice = position.entryPrice ?? position.signal.ohlcData?.close;

  const metaItems = [
    { label: 'Instrument', value: position.signal.instrument },
    { label: 'Timeframe', value: position.signal.timeframe },
    {
      label: 'Direction',
      value: position.signal.signal,
      className: position.signal.signal === 'BUY' ? 'text-green-600 dark:text-green-400 font-semibold' : position.signal.signal === 'SELL' ? 'text-red-600 dark:text-red-400 font-semibold' : '',
    },
    { label: 'Entry Price', value: entryPrice },
    { label: 'Exit Price', value: exitPrice ?? '—' },
    {
      label: 'P/L',
      value: ticksPnL != null ? `${ticksPnL >= 0 ? '+' : ''}${ticksPnL} ticks` : '—',
      className: position.status === 'CLOSED' && ticksPnL != null
        ? isProfit ? 'text-green-600 dark:text-green-400 font-semibold' : isLoss ? 'text-red-600 dark:text-red-400 font-semibold' : 'text-muted-foreground'
        : '',
    },
    {
      label: 'Max Drawdown',
      value: maxDrawdown != null ? `${maxDrawdown} ticks` : '—',
      className: (maxDrawdown ?? 0) > 0 ? 'text-amber-600 dark:text-amber-500 font-medium' : '',
    },
    ...(maxDrawdown != null && maxDrawdown > 0 && ticksPnL != null
      ? [{
          label: 'R:R',
          value: `${(ticksPnL / maxDrawdown).toFixed(2)}x`,
          className: 'text-muted-foreground',
        }]
      : []),
    { label: 'Entry Date', value: position.entryConfirmedAt ? formatDateTime(position.entryConfirmedAt) : '—' },
    { label: 'Candles Held', value: position.currentCandleCount },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* Primary information */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-x-6 gap-y-3">
            {metaItems.map((item) => (
              <div key={item.label} className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">{item.label}</span>
                <span className={cn('text-sm font-medium tabular-nums', item.className)}>{item.value}</span>
              </div>
            ))}
          </div>
          {position.status === 'OPEN' && (
            <Button variant="destructive" size="sm" onClick={handleExit} disabled={exiting}>
              {exiting ? 'Exiting...' : 'Exit position'}
            </Button>
          )}
        </div>
        </CardContent>
      </Card>

      {/* Signal */}
      <div className="flex flex-col">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Entry signal
        </h2>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm mb-2">
            <span className="text-muted-foreground">Strategy:</span>{' '}
            <Link
              href={`/strategies/${position.signal.strategy.id}`}
              className="text-primary hover:underline font-medium"
            >
              {position.signal.strategy.name}
            </Link>
          </p>
          <p className="text-sm text-foreground leading-relaxed">{position.signal.reasoning}</p>
          </CardContent>
        </Card>
      </div>

      {/* Evolution (Events log) - Tab format */}
      <div className="flex flex-col">
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Evolution
        </h2>
        <Card>
          <CardContent className="p-4">
            {!position.positionLogs?.length ? (
            <p className="text-sm text-muted-foreground py-4">
              {position.status === 'OPEN'
                ? 'No events yet. Logs are generated as new candles are analyzed.'
                : 'No events recorded.'}
            </p>
          ) : (
            <Tabs defaultValue="0" className="w-full">
              <TabsList className="w-full flex-wrap h-auto gap-1 p-2 overflow-x-auto justify-start">
                {position.positionLogs.map((log, i) => (
                  <TabsTrigger
                    key={log.id}
                    value={String(i)}
                    className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[80px] data-[state=active]:bg-background"
                  >
                    <span className="text-xs font-medium">Candle {i + 1}</span>
                    <span className="text-xs tabular-nums font-medium">{log.closePrice ?? log.ohlcData?.close ?? '—'}</span>
                    {log.ticksPnL != null && (
                      <span
                        className={cn(
                          'text-xs tabular-nums font-medium',
                          log.ticksPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {log.ticksPnL >= 0 ? '+' : ''}{log.ticksPnL} ticks
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {position.positionLogs.map((log, i) => (
                <TabsContent key={log.id} value={String(i)} className="mt-4 p-4 rounded-lg bg-muted/50">
                  <p className="text-xs text-muted-foreground mb-2">
                    {formatDateTime(log.candleTimestamp)} · Close: {log.closePrice ?? log.ohlcData?.close ?? '—'}
                    {log.ticksPnL != null && (
                      <span
                        className={cn(
                          ' ml-2 font-medium',
                          log.ticksPnL >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {log.ticksPnL >= 0 ? '+' : ''}{log.ticksPnL} ticks
                      </span>
                    )}
                  </p>
                  <h3 className="text-sm font-medium mb-2">AI recommendation</h3>
                  <p className="text-sm text-foreground leading-relaxed">{log.conclusion}</p>
                </TabsContent>
              ))}
            </Tabs>
          )}
          </CardContent>
        </Card>
      </div>

      {/* Conclusion */}
      {position.status === 'CLOSED' && position.learningInsights && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Conclusion
          </h2>
          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {(() => {
                try {
                  const insights = JSON.parse(position.learningInsights);
                  return Array.isArray(insights) ? (
                    insights.map((insight: string, index: number) => (
                      <div key={index} className="flex gap-3">
                        <span className="shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                          {index + 1}
                        </span>
                        <p className="text-sm text-foreground leading-relaxed flex-1">{insight}</p>
                      </div>
                    ))
                  ) : null;
                } catch {
                  return (
                    <p className="text-sm text-muted-foreground">Unable to parse insights</p>
                  );
                }
              })()}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
