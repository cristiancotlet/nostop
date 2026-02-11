'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PageLayout } from '@/components/layout/PageLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface Signal {
  id: string;
  timestamp: string;
  instrument: string;
  timeframe: string;
  signal: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
  strategy: {
    id: string;
    name: string;
    rules: string;
  };
  ohlcData?: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
  } | null;
  positions: Array<{
    id: string;
    status: string;
  }>;
}

export default function SignalDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [signal, setSignal] = useState<Signal | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingPosition, setCreatingPosition] = useState(false);

  useEffect(() => {
    if (params.id) {
      fetchSignal();
    }
  }, [params.id]);

  const fetchSignal = async () => {
    try {
      const response = await fetch(`/api/signals/${params.id}`);
      const data = await response.json();
      if (data.success) {
        setSignal(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch signal:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePosition = async () => {
    if (!signal) return;

    if (!confirm('Create a position from this signal?')) {
      return;
    }

    setCreatingPosition(true);
    try {
      const response = await fetch('/api/positions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          signalId: signal.id,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        router.push(`/positions/${data.data.id}`);
      } else {
        alert(data.error || 'Failed to create position');
      }
    } catch (error) {
      console.error('Failed to create position:', error);
      alert('Failed to create position');
    } finally {
      setCreatingPosition(false);
    }
  };

  const getSignalBadgeVariant = (
    s: string
  ): 'default' | 'destructive' | 'secondary' | 'outline' => {
    if (s === 'BUY') return 'default';
    if (s === 'SELL') return 'destructive';
    return 'secondary';
  };

  if (loading) {
    return (
      <PageLayout title="Signal">
        <div className="py-12 text-center text-muted-foreground text-sm">
          Loading signal details...
        </div>
      </PageLayout>
    );
  }

  if (!signal) {
    return (
      <PageLayout title="Signal">
        <div className="py-12 text-center text-muted-foreground text-sm">
          Signal not found
        </div>
      </PageLayout>
    );
  }

  const hasOpenPosition = signal.positions.some((p) => p.status === 'OPEN');

  return (
    <PageLayout title="Signal Details">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Signal</CardTitle>
                <Badge variant={getSignalBadgeVariant(signal.signal)}>{signal.signal}</Badge>
              </div>
              <span className="text-sm text-muted-foreground">
                {new Date(signal.timestamp).toLocaleString()}
              </span>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm font-medium">Reasoning</p>
            <p className="text-sm">{signal.reasoning}</p>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Signal Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div>
                <span className="text-muted-foreground">Instrument:</span> {signal.instrument}
              </div>
              <div>
                <span className="text-muted-foreground">Timeframe:</span> {signal.timeframe}
              </div>
              <div>
                <span className="text-muted-foreground">Strategy:</span>{' '}
                <Link
                  href={`/strategies/${signal.strategy.id}`}
                  className="text-primary hover:underline"
                >
                  {signal.strategy.name}
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">OHLC Data</CardTitle>
            </CardHeader>
            <CardContent>
              {signal.ohlcData ? (
                <div className="space-y-1 text-sm">
                  <div>
                    <span className="text-muted-foreground">Timestamp:</span>{' '}
                    {new Date(signal.ohlcData.timestamp).toLocaleString()}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Open:</span> {signal.ohlcData.open}
                  </div>
                  <div>
                    <span className="text-muted-foreground">High:</span> {signal.ohlcData.high}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Low:</span> {signal.ohlcData.low}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Close:</span> {signal.ohlcData.close}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Candle data was deleted; instrument and timeframe preserved.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {signal.signal !== 'HOLD' && !hasOpenPosition && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Create Position</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Create a position from this signal to start monitoring its performance.
              </p>
              <Button
                onClick={handleCreatePosition}
                disabled={creatingPosition}
              >
                {creatingPosition ? 'Creating...' : 'Create Position'}
              </Button>
            </CardContent>
          </Card>
        )}

        {signal.positions.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Related Positions</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {signal.positions.map((position) => (
                  <Link
                    key={position.id}
                    href={`/positions/${position.id}`}
                    className="block p-2 border rounded hover:bg-accent/50 transition-colors"
                  >
                    Position {position.id.slice(0, 8)}... - Status: {position.status}
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PageLayout>
  );
}
