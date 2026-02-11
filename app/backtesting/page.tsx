'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import TradingViewChart, { OHLCData } from '@/components/TradingViewChart';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface Strategy {
  id: string;
  name: string;
}

interface BacktestDataset {
  id: string;
  name: string;
  instrumentType: string;
  timeframe: string;
  startDate: string;
  createdAt?: string;
}

interface BacktestOHLC {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface SignalResult {
  signal: 'BUY' | 'SELL' | 'HOLD';
  reasoning: string;
}

import { computeTicksPnL, INSTRUMENT_OPTIONS, INSTRUMENTS } from '@/lib/instruments';
import { formatRulesForPrompt } from '@/lib/strategy-rules';

interface PositionLogEntry {
  candleTimestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  conclusion: string;
  ticksPnL: number;
}

interface BacktestPosition {
  signal: string;
  reasoning: string;
  entryCandle: BacktestOHLC;
  entryStartIndex: number;
  logs: PositionLogEntry[];
  candleCount: number;
}

export default function BacktestingPage() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedStrategy, setSelectedStrategy] = useState('');
  const [selectedIndicator] = useState('swing-zone');

  const [datasets, setDatasets] = useState<BacktestDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(null);
  const [selectedInstrumentType, setSelectedInstrumentType] = useState<string>('CL');
  const [backtestData, setBacktestData] = useState<BacktestOHLC[]>([]);
  const [instrument, setInstrument] = useState('');
  const [timeframe, setTimeframe] = useState('2h');
  const [startIndex, setStartIndex] = useState(0);
  const [datasetStartDate, setDatasetStartDate] = useState<string>('');

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalInstrumentType, setModalInstrumentType] = useState<string>('CL');
  const [modalTimeframe, setModalTimeframe] = useState('2h');
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const [signalLoading, setSignalLoading] = useState(false);
  const [signalResult, setSignalResult] = useState<SignalResult | null>(null);
  const [signalError, setSignalError] = useState<string | null>(null);

  const [backtestPosition, setBacktestPosition] = useState<BacktestPosition | null>(null);
  const [positionAnalyzeLoading, setPositionAnalyzeLoading] = useState(false);
  const [learningInsights, setLearningInsights] = useState<string[] | null>(null);
  const [learningLoading, setLearningLoading] = useState(false);
  const [savedPositionId, setSavedPositionId] = useState<string | null>(null);

  const chartRef = useRef<HTMLDivElement>(null);

  const parseFirstTimestampFromCSV = async (file: File): Promise<string | null> => {
    try {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return null;
      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const timeColIdx = headers.findIndex((h) => h === 'time' || h === 'timestamp' || h === 'date');
      if (timeColIdx === -1) return null;
      const timestamps: Date[] = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const raw = cols[timeColIdx]?.trim();
        if (!raw) continue;
        const d = new Date(raw);
        if (!isNaN(d.getTime())) timestamps.push(d);
      }
      if (timestamps.length === 0) return null;
      timestamps.sort((a, b) => a.getTime() - b.getTime());
      const first = timestamps[0];
      const y = first.getFullYear();
      const m = String(first.getMonth() + 1).padStart(2, '0');
      const d = String(first.getDate()).padStart(2, '0');
      const h = String(first.getHours()).padStart(2, '0');
      const min = String(first.getMinutes()).padStart(2, '0');
      const sec = String(first.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${d}T${h}:${min}:${sec}`;
    } catch {
      return null;
    }
  };

  const visibleData: OHLCData[] = backtestData.length === 0
    ? []
    : backtestData
        .slice(0, startIndex + 1)
        .map((c) => ({
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          instrument,
          timeframe,
        }));

  const currentCandle = visibleData.length > 0 ? visibleData[visibleData.length - 1] : null;
  const canNext = backtestData.length > 0 && startIndex < backtestData.length - 1;

  const toDatetimeLocal = (ts: string) => {
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    const sec = String(d.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${day}T${h}:${min}:${sec}`;
  };

  const handleJumpToDateTime = (datetimeLocal: string) => {
    if (!backtestData.length || !datetimeLocal) return;
    const targetTime = new Date(datetimeLocal).getTime();
    if (isNaN(targetTime)) return;
    let idx = 0;
    for (let i = 0; i < backtestData.length; i++) {
      if (new Date(backtestData[i].timestamp).getTime() <= targetTime) idx = i;
    }
    setStartIndex(idx);
    setSignalResult(null);
    setBacktestPosition(null);
    setLearningInsights(null);
  };

  const currentDateTimeValue = backtestData.length > 0 && backtestData[startIndex]
    ? toDatetimeLocal(backtestData[startIndex].timestamp)
    : '';

  const loadDatasets = () => {
    fetch('/api/backtest/datasets')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) setDatasets(data.data);
      })
      .catch(console.error);
  };

  const loadDatasetData = (id: string) => {
    fetch(`/api/backtest/datasets/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data.success || !data.data) return;
        const d = data.data;
        const ohlc = d.ohlc as BacktestOHLC[];
        if (!ohlc || ohlc.length === 0) return;
        const startDate = new Date(d.startDate).getTime();
        let idx = 0;
        for (let i = 0; i < ohlc.length; i++) {
          if (new Date(ohlc[i].timestamp).getTime() <= startDate) idx = i;
        }
        setBacktestData(ohlc);
        setInstrument(d.name);
        setSelectedInstrumentType(d.instrumentType || 'CL');
        setTimeframe(d.timeframe);
        setDatasetStartDate(d.startDate);
        setStartIndex(idx);
        setSignalResult(null);
        setBacktestPosition(null);
        setLearningInsights(null);
      })
      .catch(console.error);
  };

  useEffect(() => {
    fetch('/api/strategies')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data?.length > 0) {
          setStrategies(data.data);
          setSelectedStrategy((prev) => prev || data.data[0].id);
        }
      })
      .catch(console.error);
    loadDatasets();
  }, []);

  useEffect(() => {
    if (selectedDatasetId) {
      loadDatasetData(selectedDatasetId);
    } else {
      setBacktestData([]);
      setInstrument('');
      setStartIndex(0);
    }
  }, [selectedDatasetId]);

  const handleImportSave = async () => {
    if (!modalFile || !modalTimeframe.trim() || !modalStartDate.trim()) {
      setModalError('Select a file, instrument type, timeframe and start date');
      return;
    }
    setModalLoading(true);
    setModalError(null);
    try {
      const opt = INSTRUMENT_OPTIONS.find((o) => o.value === modalInstrumentType);
      const name = opt?.name ?? modalInstrumentType;
      const formData = new FormData();
      formData.append('file', modalFile);
      formData.append('name', name);
      formData.append('instrumentType', modalInstrumentType);
      formData.append('timeframe', modalTimeframe.trim());
      formData.append('startDate', modalStartDate);
      const res = await fetch('/api/backtest/datasets', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setModalError(data.error || 'Import failed');
        return;
      }
      setImportModalOpen(false);
      setModalFile(null);
      setModalInstrumentType('CL');
      setModalTimeframe('2h');
      setModalStartDate('');
      loadDatasets();
      if (data.data?.id) {
        setSelectedDatasetId(data.data.id);
      }
    } catch (err: any) {
      setModalError(err.message || 'Import failed');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteDatasetById = async (id: string) => {
    if (!confirm('Delete this data? (Positions, signals and strategies are not affected)')) return;
    try {
      const res = await fetch(`/api/backtest/datasets/${id}`, { method: 'DELETE' });
      if (res.ok) {
        if (selectedDatasetId === id) {
          setSelectedDatasetId(null);
          setBacktestData([]);
          setInstrument('');
          setStartIndex(0);
        } else {
          setSelectedDatasetId(selectedDatasetId);
        }
        loadDatasets();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleNext = async () => {
    if (!canNext) return;

    setLearningInsights(null);
    const nextIndex = startIndex + 1;
    const newCandle = backtestData[nextIndex];

    if (backtestPosition) {
      setPositionAnalyzeLoading(true);
      try {
        const res = await fetch('/api/backtest/position-analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            strategyId: selectedStrategy,
            chartData: visibleData.map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
            entrySignal: backtestPosition.signal,
            entryPrice: backtestPosition.entryCandle.close,
            entryCandle: backtestPosition.entryCandle,
            initialReasoning: backtestPosition.reasoning,
            positionLogs: backtestPosition.logs.map((l) => ({
              candleTimestamp: l.candleTimestamp,
              conclusion: l.conclusion,
              open: l.open,
              high: l.high,
              low: l.low,
              close: l.close,
              ticksPnL: l.ticksPnL,
            })),
            newCandle: {
              timestamp: newCandle.timestamp,
              open: newCandle.open,
              high: newCandle.high,
              low: newCandle.low,
              close: newCandle.close,
            },
            candleCount: backtestPosition.candleCount,
            instrumentType: selectedInstrumentType,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const ticksPnL = computeTicksPnL(backtestPosition.signal, backtestPosition.entryCandle.close, newCandle.close, selectedInstrumentType);
          setBacktestPosition((prev) =>
            prev
              ? {
                  ...prev,
                  logs: [...prev.logs, {
                    candleTimestamp: newCandle.timestamp,
                    open: newCandle.open,
                    high: newCandle.high,
                    low: newCandle.low,
                    close: newCandle.close,
                    conclusion: data.data.conclusion,
                    ticksPnL,
                  }],
                  candleCount: prev.candleCount + 1,
                }
              : null
          );
        }
      } catch (err) {
        console.error(err);
      } finally {
        setPositionAnalyzeLoading(false);
      }
    }

    setStartIndex(nextIndex);
  };

  const handleGetSignal = async () => {
    if (!selectedStrategy || !currentCandle || visibleData.length === 0) {
      setSignalError('Import data and set start date first');
      return;
    }
    setSignalLoading(true);
    setSignalError(null);
    setSignalResult(null);
    try {
      const res = await fetch('/api/backtest/signal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          strategyId: selectedStrategy,
          chartData: visibleData.map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
          currentCandle: {
            timestamp: currentCandle.timestamp,
            open: currentCandle.open,
            high: currentCandle.high,
            low: currentCandle.low,
            close: currentCandle.close,
          },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSignalResult({ signal: data.data.signal, reasoning: data.data.reasoning });
      } else {
        setSignalError(data.error || 'Failed to get signal');
      }
    } catch (err: any) {
      setSignalError(err.message || 'Failed to get signal');
    } finally {
      setSignalLoading(false);
    }
  };

  const handleEnterPosition = () => {
    if (!signalResult || !currentCandle || signalResult.signal === 'HOLD') return;
    setBacktestPosition({
      signal: signalResult.signal,
      reasoning: signalResult.reasoning,
      entryCandle: {
        timestamp: currentCandle.timestamp,
        open: currentCandle.open,
        high: currentCandle.high,
        low: currentCandle.low,
        close: currentCandle.close,
      },
      entryStartIndex: startIndex,
      logs: [],
      candleCount: 0,
    });
    setLearningInsights(null);
  };

  const handleMarkClosed = async () => {
    if (!backtestPosition || !currentCandle) return;
    setLearningLoading(true);
    setSavedPositionId(null);
    try {
      let strategyRules = 'No strategy rules';
      const stratRes = await fetch(`/api/strategies/${selectedStrategy}`);
      const stratData = await stratRes.json();
      if (stratData.success && stratData.data?.rules) {
        strategyRules = formatRulesForPrompt(stratData.data.rules);
      }
      const chartDataFromEntryToExit = backtestData.slice(
        backtestPosition.entryStartIndex,
        startIndex + 1
      ).map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close }));

      const chartDataForIndicator = backtestData.slice(
        Math.max(0, startIndex - 99),
        startIndex + 1
      ).map((c) => ({ timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close }));

      const finalTicksPnL = computeTicksPnL(
        backtestPosition.signal,
        backtestPosition.entryCandle.close,
        currentCandle.close,
        selectedInstrumentType
      );

      const res = await fetch('/api/backtest/position-learning', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entrySignal: backtestPosition.signal,
          entryPrice: backtestPosition.entryCandle.close,
          initialReasoning: backtestPosition.reasoning,
          strategyRules,
          instrumentType: selectedInstrumentType,
          entryCandle: backtestPosition.entryCandle,
          positionLogs: backtestPosition.logs.map((l) => ({
            candleTimestamp: l.candleTimestamp,
            open: l.open,
            high: l.high,
            low: l.low,
            close: l.close,
            conclusion: l.conclusion,
            ticksPnL: l.ticksPnL,
          })),
          exitCandle: { timestamp: currentCandle.timestamp, open: currentCandle.open, high: currentCandle.high, low: currentCandle.low, close: currentCandle.close },
          chartData: chartDataFromEntryToExit,
          chartDataForIndicator: chartDataForIndicator,
          finalTicksPnL,
        }),
      });
      const data = await res.json();
      if (!data.success || !data.data?.insights) {
        setLearningLoading(false);
        return;
      }
      const insights = data.data.insights as string[];

      const saveRes = await fetch('/api/backtest/save-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instrument,
          timeframe,
          strategyId: selectedStrategy,
          signal: backtestPosition.signal,
          reasoning: backtestPosition.reasoning,
          entryCandle: backtestPosition.entryCandle,
          positionLogs: backtestPosition.logs.map((l) => ({
            candleTimestamp: l.candleTimestamp,
            open: l.open,
            high: l.high,
            low: l.low,
            close: l.close,
            conclusion: l.conclusion,
            ticksPnL: l.ticksPnL,
          })),
          learningInsights: insights,
        }),
      });
      const saveData = await saveRes.json();
      setBacktestPosition(null);
      setSignalResult(null);
      setLearningInsights(insights);
      if (saveData.success && saveData.data?.positionId) {
        setSavedPositionId(saveData.data.positionId);
        setTimeout(() => setSavedPositionId(null), 5000);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLearningLoading(false);
    }
  };

  const getSignalVariant = (s: string): 'default' | 'destructive' | 'secondary' => {
    if (s === 'BUY') return 'default';
    if (s === 'SELL') return 'destructive';
    return 'secondary';
  };

  const getSignalBadgeClass = (s: string) => {
    if (s === 'BUY') return 'border-transparent bg-green-600 text-white hover:bg-green-600/90 dark:bg-green-600 dark:text-white';
    if (s === 'SELL') return 'border-transparent bg-red-600 text-white hover:bg-red-600/90 dark:bg-red-600 dark:text-white';
    return '';
  };

  const getEnterButtonClass = (s: string) => {
    if (s === 'BUY') return 'bg-green-600 hover:bg-green-700 text-white';
    if (s === 'SELL') return 'bg-red-600 hover:bg-red-700 text-white';
    return '';
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex flex-col overflow-hidden bg-background w-full px-1">
        {/* Top bar: Strategy + Indicator (left) | Instrument select + Delete + Add new (right) */}
      <div className="flex-shrink-0 flex items-center justify-between gap-4 py-2 border-b bg-background">
        <div className="flex items-center gap-4">
          <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
            <SelectTrigger className="h-8 w-[180px] text-xs">
              <SelectValue placeholder="Select strategy" />
            </SelectTrigger>
            <SelectContent>
              {strategies.map((s) => (
                <SelectItem key={s.id} value={s.id} className="text-xs">
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Swing Zone</span>
        </div>
        <div className="flex items-center gap-2">
          {datasets.length === 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => { setModalError(null); setImportModalOpen(true); }}
            >
              Add New
            </Button>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 min-w-[140px] justify-between text-xs font-normal">
                  {selectedDatasetId
                    ? datasets.find((d) => d.id === selectedDatasetId)?.name ?? 'Select dataset'
                    : 'Select dataset'}
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-2 opacity-50"><path d="m6 9 6 6 6-6"/></svg>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                {datasets.map((d) => (
                  <DropdownMenuItem
                    key={d.id}
                    onClick={() => setSelectedDatasetId(d.id)}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="flex-1 truncate">{d.name}</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        handleDeleteDatasetById(d.id);
                      }}
                      className="rounded p-1 text-destructive hover:bg-destructive/10"
                      title="Delete data"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                    </button>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem
                  onClick={() => { setModalError(null); setImportModalOpen(true); }}
                  className="text-muted-foreground"
                >
                  Add New
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {backtestData.length > 0 && (
            <>
              <Input
                type="datetime-local"
                value={currentDateTimeValue}
                onChange={(e) => handleJumpToDateTime(e.target.value)}
                min={toDatetimeLocal(backtestData[0].timestamp)}
                max={toDatetimeLocal(backtestData[backtestData.length - 1].timestamp)}
                className="h-8 w-[180px] text-xs"
              />
              <span className="text-xs text-muted-foreground">{backtestData.length} candles</span>
            </>
          )}
        </div>
      </div>

      {/* Import modal */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import Data</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>CSV File</Label>
              <Input
                type="file"
                accept=".csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  setModalFile(f || null);
                  if (f) {
                    const name = f.name.toLowerCase();
                    if (name.includes('comex') && name.includes('hg')) setModalInstrumentType('HG');
                    else if (name.includes('comex') && name.includes('gc')) setModalInstrumentType('GC');
                    else if (name.includes('nymex') && name.includes('cl')) setModalInstrumentType('CL');
                    else if (name.includes('nymex') && name.includes('ng')) setModalInstrumentType('NG');
                    const firstTs = await parseFirstTimestampFromCSV(f);
                    if (firstTs) setModalStartDate(firstTs);
                  }
                }}
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Instrument</Label>
              <Select value={modalInstrumentType} onValueChange={setModalInstrumentType}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Select instrument" />
                </SelectTrigger>
                <SelectContent>
                  {INSTRUMENT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} (tick {INSTRUMENTS[opt.value].tickSize})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timeframe</Label>
              <Input
                value={modalTimeframe}
                onChange={(e) => setModalTimeframe(e.target.value)}
                placeholder="e.g. 2h"
                className="text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date/Time</Label>
              <Input
                type="datetime-local"
                value={modalStartDate}
                onChange={(e) => setModalStartDate(e.target.value)}
                className="text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Data will be shown up to this point. Only past data is used for AI.
              </p>
            </div>
            {modalError && (
              <p className="text-xs text-destructive">{modalError}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModalOpen(false)} disabled={modalLoading}>
              Cancel
            </Button>
            <Button onClick={handleImportSave} disabled={modalLoading}>
              {modalLoading ? 'Importing...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex-1 flex min-h-0">
        {/* Chart: edge-to-edge */}
        <div className="flex-1 flex flex-col min-w-0 p-2">
          {backtestData.length > 0 && instrument ? (
            <div className="flex-1 min-h-0" ref={chartRef}>
              <TradingViewChart
                instrument={instrument}
                timeframe={timeframe}
                data={visibleData}
              />
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm border rounded bg-muted/30">
              Import CSV to start
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <div className="w-80 flex-shrink-0 min-h-0 flex flex-col gap-3 p-3 overflow-y-auto border-l bg-background scrollbar-minimal">
          <div className="flex flex-col gap-2">
            <Button
              onClick={handleNext}
              disabled={!canNext || positionAnalyzeLoading}
              className="w-full h-8 text-xs"
              size="sm"
            >
              {positionAnalyzeLoading ? 'Analyzing...' : 'Next'}
            </Button>
            <Button
              onClick={handleGetSignal}
              disabled={signalLoading || visibleData.length === 0 || !selectedStrategy}
              className="w-full h-8 text-xs"
              size="sm"
              variant="secondary"
            >
              {signalLoading ? 'Getting signal...' : 'Get signal'}
            </Button>
            {signalError && (
              <p className="text-xs text-destructive">{signalError}</p>
            )}
          </div>

          {signalResult && !backtestPosition && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Signal</span>
                <Badge variant={getSignalVariant(signalResult.signal)} className={cn('text-xs', getSignalBadgeClass(signalResult.signal))}>
                  {signalResult.signal}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{signalResult.reasoning}</p>
              {signalResult.signal !== 'HOLD' && (
                <Button onClick={handleEnterPosition} className={cn('w-full h-8 text-xs', getEnterButtonClass(signalResult.signal))} size="sm">
                  Enter position
                </Button>
              )}
            </div>
          )}

          {backtestPosition && (
            <div className="space-y-3">
              {/* Signal */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium">Position</span>
                  <Badge variant={getSignalVariant(backtestPosition.signal)} className={cn('text-xs', getSignalBadgeClass(backtestPosition.signal))}>
                    {backtestPosition.signal}
                  </Badge>
                </div>
                <p className="text-xs">
                  {backtestPosition.signal} @ {backtestPosition.entryCandle.close}
                </p>
                <p className="text-xs text-muted-foreground">{backtestPosition.reasoning}</p>
              </div>

              {/* Mark position closed */}
              <Button
                onClick={handleMarkClosed}
                disabled={learningLoading}
                variant="destructive"
                className="w-full h-8 text-xs"
                size="sm"
              >
                {learningLoading ? 'Analyzing...' : 'Mark position closed'}
              </Button>

              {/* Events log - newest first */}
              <div className="space-y-1">
                <span className="text-xs font-medium">Events log</span>
                <div className="space-y-1">
                  {[...backtestPosition.logs].reverse().map((log, i) => (
                    <div key={i} className="py-1 border-b border-border/50 last:border-0">
                      <p className="text-xs">{log.conclusion}</p>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.candleTimestamp).toLocaleString()} · {log.close}
                        {log.ticksPnL != null && (
                          <span className={log.ticksPnL >= 0 ? ' text-green-600 dark:text-green-400' : ' text-red-600 dark:text-red-400'}>
                            {' '}· {log.ticksPnL >= 0 ? '+' : ''}{log.ticksPnL} ticks
                          </span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {savedPositionId && (
            <p className="text-xs text-green-600 dark:text-green-400">
              Saved to Positions. <Link href={`/positions/${savedPositionId}`} className="font-medium underline">View</Link> or <Link href="/positions" className="font-medium underline">list all</Link>.
            </p>
          )}

          {learningInsights && learningInsights.length > 0 && (
            <div className="space-y-2">
              <span className="text-xs font-medium">3 key learnings</span>
              <div className="space-y-1">
                {learningInsights.map((insight, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-semibold">
                      {i + 1}
                    </span>
                    <p className="text-xs flex-1">{insight}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
