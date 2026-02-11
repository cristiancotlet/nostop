'use client';

import { useState, useEffect, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DataListItemCard } from '@/components/DataListItemCard';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/layout/PageLayout';

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
  };
}

const DEBOUNCE_MS = 300;

export default function SignalHistory() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    instrument: '',
    timeframe: '',
    signal: '',
  });
  const [instrumentInput, setInstrumentInput] = useState('');

  useEffect(() => {
    const t = setTimeout(() => {
      setFilters((f) => ({ ...f, instrument: instrumentInput }));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [instrumentInput]);

  const fetchSignals = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.instrument) params.append('instrument', filters.instrument);
      if (filters.timeframe) params.append('timeframe', filters.timeframe);
      if (filters.signal) params.append('signal', filters.signal);

      const response = await fetch(`/api/signals?${params}`);
      const data = await response.json();
      if (data.success) {
        setSignals(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch signals:', error);
    } finally {
      setLoading(false);
    }
  }, [filters.instrument, filters.timeframe, filters.signal]);

  useEffect(() => {
    fetchSignals();
  }, [fetchSignals]);

  const getSignalVariant = (signal: string): "default" | "destructive" | "secondary" | "outline" => {
    switch (signal) {
      case 'BUY':
        return 'default';
      case 'SELL':
        return 'destructive';
      case 'HOLD':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <PageLayout
      title="Signals"
      filters={
        <>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Instrument</Label>
            <Input
              type="text"
              value={instrumentInput}
              onChange={(e) => setInstrumentInput(e.target.value)}
              placeholder="e.g., Copper"
              className="h-9 w-[140px]"
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Timeframe</Label>
            <Select
              value={filters.timeframe || "all"}
              onValueChange={(value) =>
                setFilters({ ...filters, timeframe: value === "all" ? "" : value })
              }
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="1h">1 hour</SelectItem>
                <SelectItem value="2h">2 hours</SelectItem>
                <SelectItem value="4h">4 hours</SelectItem>
                <SelectItem value="1d">1 day</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Signal</Label>
            <Select
              value={filters.signal || "all"}
              onValueChange={(value) =>
                setFilters({ ...filters, signal: value === "all" ? "" : value })
              }
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="BUY">BUY</SelectItem>
                <SelectItem value="SELL">SELL</SelectItem>
                <SelectItem value="HOLD">HOLD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      }
    >
      {loading ? (
        <div className="py-12 text-center text-muted-foreground text-sm">
          Loading signal history...
        </div>
      ) : signals.length === 0 ? (
        <EmptyState title="No signals found" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {signals.map((signal) => (
            <DataListItemCard
              key={signal.id}
              title={signal.instrument}
              subtitle={signal.timeframe}
              href={`/signals/${signal.id}`}
              badges={[{ label: signal.signal, variant: getSignalVariant(signal.signal) }]}
              description={signal.reasoning}
              metadata={[
                { label: 'Timestamp', value: new Date(signal.timestamp).toLocaleString() },
                { label: 'Strategy', value: signal.strategy.name },
              ]}
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
