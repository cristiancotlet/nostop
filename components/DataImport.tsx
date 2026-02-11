'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface DataImportProps {
  onImportSuccess?: () => void;
}

export default function DataImport({ onImportSuccess }: DataImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [instrument, setInstrument] = useState('');
  const [timeframe, setTimeframe] = useState('2h');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setFile(selectedFile);
      setResult(null);
      
      // Try to infer instrument from filename
      const filename = selectedFile.name.toLowerCase();
      if (!instrument) {
        if (filename.includes('comex') || filename.includes('hg')) {
          setInstrument('Copper');
        }
      }
    }
  };

  const handleImport = async () => {
    if (!file) {
      setResult({ success: false, message: 'Please select a file' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      if (instrument) formData.append('instrument', instrument);
      if (timeframe) formData.append('timeframe', timeframe);

      const response = await fetch('/api/ohlc/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ success: true, message: data.message || `Imported ${data.count} records` });
        setFile(null);
        // Reset file input
        const fileInput = document.getElementById('csv-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
        // Notify parent component
        if (onImportSuccess) {
          setTimeout(() => {
            onImportSuccess();
            setResult(null);
          }, 1500);
        }
      } else {
        setResult({ success: false, message: data.error || 'Import failed' });
      }
    } catch (error: any) {
      setResult({ success: false, message: error.message || 'Import failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="csv-file">Select CSV File</Label>
        <Input
          id="csv-file"
          type="file"
          accept=".csv"
          onChange={handleFileChange}
        />
        <p className="text-xs text-muted-foreground">
          CSV should have columns: time (or timestamp), open, high, low, close
        </p>
      </div>

      {file && (
        <div className="p-3 bg-muted rounded-md">
          <p className="text-sm">Selected: {file.name}</p>
        </div>
      )}

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="instrument">Instrument</Label>
          <Input
            id="instrument"
            type="text"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            placeholder="e.g., Copper, EURUSD"
          />
          <p className="text-xs text-muted-foreground">
            Required if not in CSV. Auto-detected from filename if possible.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="timeframe">Timeframe</Label>
          <Select value={timeframe} onValueChange={setTimeframe}>
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
          <p className="text-xs text-muted-foreground">
            Required if not in CSV. Default: 2h
          </p>
        </div>
      </div>

      <Button
        onClick={handleImport}
        disabled={!file || loading || !instrument}
        className="w-full"
      >
        {loading ? 'Importing...' : 'Import'}
      </Button>

      {result && (
        <Alert variant={result.success ? 'default' : 'destructive'}>
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
