'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { HOLD_EXIT_GUIDELINES } from '@/lib/ai/position-monitor-guidelines';
import { parseRuleItems } from '@/lib/strategy-rules';

interface PositionWithSignal {
  id: string;
  currentCandleCount: number;
  learningInsights: string | null;
  signal: {
    instrument: string;
    timeframe: string;
    timestamp: string;
  };
}

interface Strategy {
  id: string;
  name: string;
  description: string | null;
  rules: string;
  version: number;
  positions: PositionWithSignal[];
}

interface OptimizeResult {
  ruleImprovements: string[];
  holdExitGuidelines: string[];
  summary: string;
}

interface StrategyDetailProps {
  strategyId: string;
}

export default function StrategyDetail({ strategyId }: StrategyDetailProps) {
  const [strategy, setStrategy] = useState<Strategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState<OptimizeResult | null>(null);

  useEffect(() => {
    fetchStrategy();
  }, [strategyId]);

  const fetchStrategy = async () => {
    try {
      const response = await fetch(`/api/strategies/${strategyId}`);
      const data = await response.json();
      if (data.success) {
        setStrategy(data.data);
        setOptimizeResult(null);
      }
    } catch (error) {
      console.error('Failed to fetch strategy:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    setOptimizeResult(null);
    try {
      const response = await fetch(`/api/strategies/${strategyId}/optimize`, {
        method: 'POST',
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setOptimizeResult(data.data);
      } else {
        alert(data.error || 'Failed to optimize');
      }
    } catch (error) {
      console.error('Optimize error:', error);
      alert('Failed to optimize');
    } finally {
      setOptimizing(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading strategy...
      </div>
    );
  }

  if (!strategy) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Strategy not found
      </div>
    );
  }

  const hasConclusions = strategy.positions.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{strategy.name}</h1>
          {strategy.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{strategy.description}</p>
          )}
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href={`/strategies/${strategyId}/edit`}>Edit</Link>
        </Button>
      </div>

      {/* Core rules + Hold/Exit guidelines side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            Strategy rules (core)
          </h2>
          <Card>
            <CardContent className="p-4 max-h-[400px] overflow-auto">
              {(() => {
                const items = parseRuleItems(strategy.rules);
                if (items.length === 0) {
                  return (
                    <pre className="text-sm text-foreground whitespace-pre-wrap font-sans">
                      {strategy.rules || 'No rules defined'}
                    </pre>
                  );
                }
                return (
                  <div className="space-y-2">
                    {items.map((r, i) => (
                      <div key={r.id} className="flex gap-2 text-sm">
                        <span className="text-muted-foreground shrink-0 font-medium">{i + 1}.</span>
                        <p className="text-foreground leading-relaxed">{r.text}</p>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
            HOLD/EXIT guidelines (during open position)
          </h2>
          <p className="text-xs text-muted-foreground mb-2">
            Rules AI uses when deciding whether to HOLD or EXIT during an open position:
          </p>
          <Card>
            <CardContent className="p-4 max-h-[400px] overflow-auto">
              <ul className="space-y-2 text-sm text-foreground">
                {HOLD_EXIT_GUIDELINES.map((g, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-muted-foreground shrink-0">•</span>
                    <span>{g}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Optimization section - before conclusions */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
          AI optimization
        </h2>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Button
              onClick={handleOptimize}
              disabled={optimizing || !hasConclusions}
              className="w-fit"
            >
              {optimizing ? 'Analyzing...' : 'Get optimization summary'}
            </Button>
            {!hasConclusions && (
              <p className="text-xs text-muted-foreground">
                Requires at least one closed position with conclusions.
              </p>
            )}
          </div>

          {optimizeResult && (
            <Card className="border-primary/50">
              <CardHeader>
                <CardTitle className="text-lg">Optimization summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-foreground">{optimizeResult.summary}</p>
                {optimizeResult.ruleImprovements.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Suggested rule improvements</h3>
                    <ul className="space-y-1 text-sm">
                      {optimizeResult.ruleImprovements.map((r, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-primary shrink-0">•</span>
                          <span>{r}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {optimizeResult.holdExitGuidelines.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium mb-2">Suggested HOLD/EXIT guidelines</h3>
                    <ul className="space-y-1 text-sm">
                      {optimizeResult.holdExitGuidelines.map((g, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-primary shrink-0">•</span>
                          <span>{g}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {optimizeResult.ruleImprovements.length === 0 &&
                  optimizeResult.holdExitGuidelines.length === 0 && (
                    <p className="text-sm text-muted-foreground italic">
                      No changes recommended. Strategy performance aligns with current rules.
                    </p>
                  )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Position conclusions - in tabs */}
      <div>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Position conclusions
        </h2>
        {!hasConclusions ? (
          <Card>
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              No closed positions with conclusions yet. Conclusions are generated when positions are
              closed (from backtesting or live trading).
            </CardContent>
          </Card>
        ) : (
          <Tabs defaultValue="0" className="w-full">
            <TabsList className="w-full flex-wrap h-auto gap-1 p-2 overflow-x-auto justify-start">
              {strategy.positions.map((pos, idx) => (
                <TabsTrigger
                  key={pos.id}
                  value={String(idx)}
                  className="flex flex-col items-center gap-0.5 px-3 py-2 min-w-[100px] data-[state=active]:bg-background"
                >
                  <span className="text-xs font-medium">Position {idx + 1}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(pos.signal.timestamp)}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
            {strategy.positions.map((pos, idx) => {
              let conclusions: string[] = [];
              try {
                const parsed = JSON.parse(pos.learningInsights || '[]');
                conclusions = Array.isArray(parsed) ? parsed : [String(parsed)];
              } catch {
                if (pos.learningInsights) conclusions = [pos.learningInsights];
              }
              return (
                <TabsContent key={pos.id} value={String(idx)} className="mt-4">
                  <Card>
                    <CardContent className="p-4">
                      <div className="mb-4">
                      <Link
                        href={`/positions/${pos.id}`}
                        className="text-sm font-medium text-primary hover:underline"
                      >
                        View position →
                      </Link>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {pos.signal.instrument} · {pos.signal.timeframe} ·{' '}
                        {formatDate(pos.signal.timestamp)} · {pos.currentCandleCount} candles
                      </p>
                    </div>
                    <div className="space-y-2">
                      {conclusions.map((c, i) => (
                        <div key={i} className="flex gap-2 text-sm">
                          <span className="shrink-0 w-5 h-5 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground">
                            {i + 1}
                          </span>
                          <p className="text-foreground leading-relaxed">{c}</p>
                        </div>
                      ))}
                    </div>
                    </CardContent>
                  </Card>
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </div>
    </div>
  );
}
