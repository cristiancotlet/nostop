'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageLayout } from '@/components/layout/PageLayout';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';

type ClearType = 'data' | 'strategies' | 'signals' | 'positions';

const CLEAR_LABELS: Record<ClearType, string> = {
  data: 'Data',
  strategies: 'Strategies',
  signals: 'Signals',
  positions: 'Positions',
};

export default function SettingsPage() {
  const [clearing, setClearing] = useState<ClearType | null>(null);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [dialogOpen, setDialogOpen] = useState<ClearType | null>(null);
  const [openaiKey, setOpenaiKey] = useState('');
  const [openaiConfigured, setOpenaiConfigured] = useState<boolean | null>(null);
  const [savingKey, setSavingKey] = useState(false);

  const fetchOpenAIStatus = async () => {
    try {
      const res = await fetch('/api/settings/openai-key');
      const data = await res.json();
      setOpenaiConfigured(data.configured ?? false);
    } catch {
      setOpenaiConfigured(false);
    }
  };

  useEffect(() => {
    fetchOpenAIStatus();
  }, []);

  const handleClear = async (type: ClearType) => {
    setClearing(type);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: data.message });
        setDialogOpen(null);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to clear' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: 'Failed to clear' });
    } finally {
      setClearing(null);
    }
  };

  const handleSaveOpenAIKey = async () => {
    setSavingKey(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/openai-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: openaiKey }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage({ type: 'success', text: 'OpenAI API key saved' });
        setOpenaiKey('');
        setOpenaiConfigured(true);
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save' });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save API key' });
    } finally {
      setSavingKey(false);
    }
  };

  const handleExportStrategies = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/settings/export/strategies');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `strategies-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setMessage({ type: 'success', text: 'Strategies exported' });
    } catch {
      setMessage({ type: 'error', text: 'Failed to export' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <PageLayout title="Settings">
      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>OpenAI API Key</CardTitle>
            <CardDescription>
              Store your API key securely. It is encrypted and never exposed to the client. AI features use this key.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {openaiConfigured !== null && (
              <p className="text-sm text-muted-foreground">
                Status: {openaiConfigured ? 'Configured' : 'Not configured'}
              </p>
            )}
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder="sk-..."
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="font-mono"
              />
              <Button
                onClick={handleSaveOpenAIKey}
                disabled={!openaiKey.trim() || savingKey}
              >
                {savingKey ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clear Database</CardTitle>
            <CardDescription>
              Permanently delete records. This cannot be undone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {(['data', 'strategies', 'signals', 'positions'] as ClearType[]).map((type) => (
              <div key={type} className="flex items-center justify-between">
                <span className="text-sm">{CLEAR_LABELS[type]}</span>
                <AlertDialog open={dialogOpen === type} onOpenChange={(o) => !clearing && setDialogOpen(o ? type : null)}>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={clearing !== null}
                    >
                      Delete
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete {CLEAR_LABELS[type]}?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete all {CLEAR_LABELS[type].toLowerCase()}.
                        {type === 'data' && ' Positions and signals keep their history (instrument, timeframe).'}
                        {type === 'signals' && ' Only signals without linked positions will be deleted.'}
                        {type === 'positions' && ' Signals linked to those positions will also be deleted. Orphan signals (no position) stay.'}
                        This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel disabled={clearing !== null}>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={(e) => {
                          e.preventDefault();
                          handleClear(type);
                        }}
                        disabled={clearing !== null}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        {clearing === type ? 'Deleting...' : 'Delete'}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Export Data</CardTitle>
            <CardDescription>
              Download your data as JSON files
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Strategies</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportStrategies}
                disabled={exporting}
              >
                {exporting ? 'Exporting...' : 'Export'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {message && (
          <p
            className={`text-sm ${
              message.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'
            }`}
          >
            {message.text}
          </p>
        )}
      </div>
    </PageLayout>
  );
}
