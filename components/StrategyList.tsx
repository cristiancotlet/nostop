'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DataListItemCard } from '@/components/DataListItemCard';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/layout/PageLayout';
import { Upload } from 'lucide-react';
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

interface Strategy {
  id: string;
  name: string;
  description: string | null;
  rules: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export default function StrategyList() {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [importMessage, setImportMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredStrategies = strategies.filter(
    (s) => !searchQuery.trim() || s.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    fetchStrategies();
  }, []);

  const fetchStrategies = async () => {
    try {
      const response = await fetch('/api/strategies');
      const data = await response.json();
      if (data.success) {
        setStrategies(data.data);
      }
    } catch (error) {
      console.error('Failed to fetch strategies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/strategies/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchStrategies();
      } else {
        alert('Failed to delete strategy');
      }
    } catch (error) {
      console.error('Failed to delete strategy:', error);
      alert('Failed to delete strategy');
    }
  };

  const handleImportClick = () => {
    setImportMessage(null);
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setImportMessage({ type: 'error', text: 'Please select a .json file' });
      return;
    }

    setImporting(true);
    setImportMessage(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const res = await fetch('/api/strategies/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await res.json();

      if (res.ok) {
        setImportMessage({ type: 'success', text: `Imported ${result.imported} strateg${result.imported === 1 ? 'y' : 'ies'}` });
        fetchStrategies();
      } else {
        setImportMessage({ type: 'error', text: result.error || 'Import failed' });
      }
    } catch (err) {
      setImportMessage({ type: 'error', text: err instanceof Error ? err.message : 'Invalid JSON file' });
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground text-sm">
        Loading strategies...
      </div>
    );
  }

  return (
    <PageLayout
      title="Strategies"
      actions={
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportFile}
          />
          <Button variant="outline" size="sm" onClick={handleImportClick} disabled={importing}>
            <Upload className="h-4 w-4 mr-2" />
            {importing ? 'Importing...' : 'Import'}
          </Button>
          <Button asChild>
            <Link href="/strategies/new">Add New</Link>
          </Button>
        </div>
      }
      filters={
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Search</Label>
          <Input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name..."
            className="h-9 w-[200px]"
          />
        </div>
      }
    >
      {importMessage && (
        <p className={`text-sm ${importMessage.type === 'success' ? 'text-green-600 dark:text-green-400' : 'text-destructive'}`}>
          {importMessage.text}
        </p>
      )}

      {filteredStrategies.length === 0 ? (
        <EmptyState
          title={strategies.length === 0 ? 'No strategies found.' : 'No matching strategies.'}
          action={
            <Button asChild>
              <Link href="/strategies/new">Add New</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredStrategies.map((strategy) => (
            <DataListItemCard
              key={strategy.id}
              title={strategy.name}
              subtitle={`Version ${strategy.version}`}
              description={strategy.description ?? undefined}
              href={`/strategies/${strategy.id}`}
              metadata={[
                { label: 'Created', value: new Date(strategy.createdAt).toLocaleDateString() },
              ]}
              actions={
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/strategies/${strategy.id}`} onClick={(e) => e.stopPropagation()}>View</Link>
                  </Button>
                  <Button variant="ghost" size="sm" asChild>
                    <Link href={`/strategies/${strategy.id}/edit`} onClick={(e) => e.stopPropagation()}>Edit</Link>
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" onClick={(e) => e.stopPropagation()}>Delete</Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This will permanently delete the strategy.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(strategy.id)}>
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              }
            />
          ))}
        </div>
      )}
    </PageLayout>
  );
}
