'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Textarea } from '@/components/ui/textarea';

interface ManualOHLCEntryProps {
  onEntrySuccess?: (newCandle?: any) => void;
  instrument?: string; // Current instrument from chart
  timeframe?: string; // Current timeframe from chart
}

export default function ManualOHLCEntry({ 
  onEntrySuccess, 
  instrument, 
  timeframe 
}: ManualOHLCEntryProps) {
  // Calculate next timestamp based on latest candle and timeframe
  const calculateNextTimestamp = (latestTimestamp: Date, tf: string): string => {
    if (!tf) return new Date().toISOString().slice(0, 16);
    
    const nextTime = new Date(latestTimestamp);
    
    // Parse timeframe and add duration to latest timestamp
    if (tf.endsWith('m')) {
      const minutes = parseInt(tf.replace('m', '')) || 1;
      nextTime.setMinutes(nextTime.getMinutes() + minutes);
    } else if (tf.endsWith('h')) {
      const hours = parseInt(tf.replace('h', '')) || 1;
      nextTime.setHours(nextTime.getHours() + hours);
    } else if (tf.endsWith('d')) {
      const days = parseInt(tf.replace('d', '')) || 1;
      nextTime.setDate(nextTime.getDate() + days);
    } else {
      // Default: add 1 hour
      nextTime.setHours(nextTime.getHours() + 1);
    }
    
    return nextTime.toISOString().slice(0, 16);
  };

  const [formData, setFormData] = useState({
    timestamp: '',
    instrument: instrument || '',
    timeframe: timeframe || '2h',
    open: '',
    high: '',
    low: '',
    close: '',
  });
  const [loadingTimestamp, setLoadingTimestamp] = useState(false);

  // Fetch latest candle and calculate next timestamp
  useEffect(() => {
    const fetchLatestCandle = async () => {
      if (!instrument || !timeframe) {
        // If no instrument/timeframe, use current time
        setFormData(prev => ({
          ...prev,
          timestamp: new Date().toISOString().slice(0, 16),
        }));
        return;
      }

      setLoadingTimestamp(true);
      try {
        const params = new URLSearchParams({
          instrument,
          timeframe,
          limit: '10000', // Fetch enough to get the latest (data is ordered ascending)
        });

        const response = await fetch(`/api/ohlc?${params}`);
        const result = await response.json();

        if (result.success && result.data && result.data.length > 0) {
          // Get the last candle (data is ordered ascending, so last item is latest)
          const latestCandle = result.data[result.data.length - 1];
          const latestTimestamp = new Date(latestCandle.timestamp);
          const nextTimestamp = calculateNextTimestamp(latestTimestamp, timeframe);
          
          setFormData(prev => ({
            ...prev,
            instrument,
            timeframe,
            timestamp: nextTimestamp,
          }));
        } else {
          // No data yet, use current time rounded to timeframe
          const now = new Date();
          let nextTime = new Date(now);
          
          if (timeframe.endsWith('m')) {
            const minutes = parseInt(timeframe.replace('m', '')) || 1;
            const roundedMinutes = Math.ceil(now.getMinutes() / minutes) * minutes;
            nextTime.setMinutes(roundedMinutes, 0, 0);
          } else if (timeframe.endsWith('h')) {
            const hours = parseInt(timeframe.replace('h', '')) || 1;
            const roundedHours = Math.ceil(now.getHours() / hours) * hours;
            nextTime.setHours(roundedHours, 0, 0, 0);
          } else if (timeframe.endsWith('d')) {
            nextTime.setDate(now.getDate() + 1);
            nextTime.setHours(0, 0, 0, 0);
          }
          
          setFormData(prev => ({
            ...prev,
            instrument,
            timeframe,
            timestamp: nextTime.toISOString().slice(0, 16),
          }));
        }
      } catch (error) {
        console.error('Failed to fetch latest candle:', error);
        // Fallback to current time
        setFormData(prev => ({
          ...prev,
          instrument,
          timeframe,
          timestamp: new Date().toISOString().slice(0, 16),
        }));
      } finally {
        setLoadingTimestamp(false);
      }
    };

    fetchLatestCandle();
  }, [instrument, timeframe]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [pasteInput, setPasteInput] = useState('');

  // Parse pasted data in format: timestamp\topen\thigh\tlow\tclose
  const handlePasteParse = () => {
    if (!pasteInput.trim()) {
      setResult({ success: false, message: 'Please paste data first' });
      return;
    }

    try {
      // Split by tab or multiple spaces
      const parts = pasteInput.trim().split(/\t+| +/).filter(p => p.trim());
      
      if (parts.length < 5) {
        setResult({ success: false, message: 'Invalid format. Expected: timestamp open high low close' });
        return;
      }

      const [timestampStr, openStr, highStr, lowStr, closeStr] = parts;

      // Parse timestamp (handle ISO format with timezone)
      const timestamp = new Date(timestampStr);
      if (isNaN(timestamp.getTime())) {
        setResult({ success: false, message: 'Invalid timestamp format' });
        return;
      }

      // Convert to datetime-local format (YYYY-MM-DDTHH:mm)
      // datetime-local expects local time without timezone info
      const year = timestamp.getFullYear();
      const month = String(timestamp.getMonth() + 1).padStart(2, '0');
      const day = String(timestamp.getDate()).padStart(2, '0');
      const hours = String(timestamp.getHours()).padStart(2, '0');
      const minutes = String(timestamp.getMinutes()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}`;

      // Parse OHLC values
      const open = parseFloat(openStr);
      const high = parseFloat(highStr);
      const low = parseFloat(lowStr);
      const close = parseFloat(closeStr);

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        setResult({ success: false, message: 'Invalid OHLC values' });
        return;
      }

      // Auto-fill form
      setFormData(prev => ({
        ...prev,
        timestamp: localTimestamp,
        open: openStr,
        high: highStr,
        low: lowStr,
        close: closeStr,
      }));

      setPasteInput('');
      setResult({ success: true, message: 'Data parsed and filled successfully' });
      setTimeout(() => setResult(null), 2000);
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to parse data' });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setResult(null);
  };

  const handleTimeframeChange = (value: string) => {
    setFormData({
      ...formData,
      timeframe: value,
    });
    setResult(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setResult(null);

    try {
      const payload = {
        ...formData,
        timestamp: new Date(formData.timestamp).toISOString(),
        open: parseFloat(formData.open),
        high: parseFloat(formData.high),
        low: parseFloat(formData.low),
        close: parseFloat(formData.close),
      };

      const response = await fetch('/api/ohlc/manual', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, message: 'OHLC data added successfully' });
        
        // Create the new candle object to pass to parent
        const newCandle = {
          id: data.data?.id || '',
          timestamp: payload.timestamp,
          instrument: payload.instrument,
          timeframe: payload.timeframe,
          open: payload.open,
          high: payload.high,
          low: payload.low,
          close: payload.close,
        };

        // Reset form but keep instrument/timeframe if provided
        setFormData(prev => ({
          ...prev,
          open: '',
          high: '',
          low: '',
          close: '',
        }));
        
        // Trigger timestamp refresh by fetching latest candle again
        if (instrument && timeframe) {
          const params = new URLSearchParams({
            instrument,
            timeframe,
            limit: '10000', // Fetch enough to get the latest
          });
          fetch(`/api/ohlc?${params}`)
            .then(res => res.json())
            .then(result => {
              if (result.success && result.data && result.data.length > 0) {
                const latestCandle = result.data[result.data.length - 1];
                const latestTimestamp = new Date(latestCandle.timestamp);
                const nextTimestamp = calculateNextTimestamp(latestTimestamp, timeframe);
                setFormData(prev => ({
                  ...prev,
                  timestamp: nextTimestamp,
                }));
              }
            })
            .catch(() => {});
        }
        
        // Notify parent component with the new candle
        if (onEntrySuccess) {
          onEntrySuccess(newCandle);
          setTimeout(() => {
            setResult(null);
          }, 1500);
        }
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to add OHLC data',
        });
      }
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Failed to add OHLC data' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-1">Manual OHLC Entry</h3>
        <p className="text-sm text-muted-foreground mb-4">
          {instrument && timeframe 
            ? `Add new candle to ${instrument} (${timeframe})`
            : 'Enter OHLC data for a new closed candle'}
        </p>
        {instrument && timeframe && (
          <div className="mb-4 p-2 bg-muted rounded text-sm">
            <strong>Instrument:</strong> {instrument} | <strong>Timeframe:</strong> {timeframe}
            {loadingTimestamp && (
              <span className="ml-2 text-muted-foreground">(Calculating next timestamp...)</span>
            )}
            {!loadingTimestamp && formData.timestamp && (
              <div className="mt-1 text-xs">
                Next candle: {new Date(formData.timestamp).toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Paste Input Section */}
      <div className="space-y-2">
        <Label htmlFor="paste-input">Quick Paste (Tab-separated)</Label>
        <div className="flex gap-2">
          <Textarea
            id="paste-input"
            placeholder="Paste: 2024-01-02T03:00:00+04:00	3.8955	3.9025	3.8925	3.9015"
            value={pasteInput}
            onChange={(e) => setPasteInput(e.target.value)}
            className="font-mono text-sm"
            rows={2}
          />
          <Button
            type="button"
            onClick={handlePasteParse}
            variant="outline"
            className="shrink-0"
          >
            Parse & Fill
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Format: timestamp (ISO) + tab + open + tab + high + tab + low + tab + close
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timestamp">Timestamp</Label>
              <Input
                type="datetime-local"
                id="timestamp"
                name="timestamp"
                value={formData.timestamp}
                onChange={handleChange}
                required
              />
            </div>

            {!instrument && (
              <div className="space-y-2">
                <Label htmlFor="instrument">Instrument</Label>
                <Input
                  type="text"
                  id="instrument"
                  name="instrument"
                  value={formData.instrument}
                  onChange={handleChange}
                  placeholder="e.g., Copper, EURUSD"
                  required
                />
              </div>
            )}

            {!timeframe && (
              <div className="space-y-2">
                <Label htmlFor="timeframe">Timeframe</Label>
                <Select value={formData.timeframe} onValueChange={handleTimeframeChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1m">1 minute</SelectItem>
                    <SelectItem value="5m">5 minutes</SelectItem>
                    <SelectItem value="15m">15 minutes</SelectItem>
                    <SelectItem value="30m">30 minutes</SelectItem>
                    <SelectItem value="1h">1 hour</SelectItem>
                    <SelectItem value="2h">2 hours</SelectItem>
                    <SelectItem value="4h">4 hours</SelectItem>
                    <SelectItem value="1d">1 day</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="open">Open</Label>
              <Input
                type="number"
                step="any"
                id="open"
                name="open"
                value={formData.open}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="high">High</Label>
              <Input
                type="number"
                step="any"
                id="high"
                name="high"
                value={formData.high}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="low">Low</Label>
              <Input
                type="number"
                step="any"
                id="low"
                name="low"
                value={formData.low}
                onChange={handleChange}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="close">Close</Label>
              <Input
                type="number"
                step="any"
                id="close"
                name="close"
                value={formData.close}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <Button
            type="submit"
            disabled={loading}
          >
            {loading ? 'Adding...' : 'Add OHLC Data'}
          </Button>

          {result && (
            <Alert variant={result.success ? 'default' : 'destructive'}>
              <AlertDescription>{result.message}</AlertDescription>
            </Alert>
          )}
        </form>
    </div>
  );
}
