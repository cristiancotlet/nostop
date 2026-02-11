'use client';

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INSTRUMENT_OPTIONS, INSTRUMENTS } from '@/lib/instruments';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { DataListItemCard } from '@/components/DataListItemCard';
import { EmptyState } from '@/components/EmptyState';
import { PageLayout } from '@/components/layout/PageLayout';

interface Dataset {
  id: string;
  name: string;
  instrumentType: string;
  timeframe: string;
  startDate: string;
  createdAt?: string;
  candleCount?: number;
}

export default function DataPage() {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const [importModalOpen, setImportModalOpen] = useState(false);
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalInstrumentType, setModalInstrumentType] = useState<string>('CL');
  const [modalTimeframe, setModalTimeframe] = useState('2h');
  const [modalStartDate, setModalStartDate] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTargetId, setEditTargetId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editLoading, setEditLoading] = useState(false);

  const loadDatasets = () => {
    fetch('/api/backtest/datasets')
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data) setDatasets(data.data);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadDatasets();
  }, []);

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
      const day = String(first.getDate()).padStart(2, '0');
      const h = String(first.getHours()).padStart(2, '0');
      const min = String(first.getMinutes()).padStart(2, '0');
      const sec = String(first.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day}T${h}:${min}:${sec}`;
    } catch {
      return null;
    }
  };

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
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this data? Positions, signals, strategies and learnings are not affected.')) return;
    try {
      const res = await fetch(`/api/backtest/datasets/${id}`, { method: 'DELETE' });
      if (res.ok) loadDatasets();
    } catch (err) {
      console.error(err);
    }
  };

  const openEditModal = (d: Dataset) => {
    setEditTargetId(d.id);
    setEditName(d.name);
    setEditModalOpen(true);
  };

  const handleEditSave = async () => {
    if (!editTargetId || !editName.trim()) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/backtest/datasets/${editTargetId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      if (res.ok) {
        setEditModalOpen(false);
        setEditTargetId(null);
        loadDatasets();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setEditLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return isNaN(d.getTime()) ? iso : d.toLocaleString();
    } catch {
      return iso;
    }
  };

  const filteredDatasets = datasets.filter(
    (d) => !searchQuery.trim() || d.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <PageLayout
      title="Data"
      actions={
        <Button onClick={() => { setModalError(null); setImportModalOpen(true); }}>
          Add New
        </Button>
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
      {filteredDatasets.length === 0 ? (
        <EmptyState
          title={datasets.length === 0 ? 'No data yet' : 'No matching datasets.'}
          action={
          <Button variant="outline" onClick={() => { setModalError(null); setImportModalOpen(true); }}>
            Import
          </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredDatasets.map((d) => (
            <DataListItemCard
              key={d.id}
              title={d.name}
              metadata={[
                { label: 'Timeframe', value: d.timeframe },
                { label: 'Start', value: formatDate(d.startDate) },
                { label: 'Candles', value: String(d.candleCount ?? '—') },
              ]}
              actions={
                <>
                  <Button variant="ghost" size="sm" onClick={() => openEditModal(d)}>
                    Edit
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleDelete(d.id)}
                  >
                    Delete
                  </Button>
                </>
              }
            />
          ))}
        </div>
      )}

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
              />
            </div>
            <div className="space-y-2">
              <Label>Instrument</Label>
              <Select value={modalInstrumentType} onValueChange={setModalInstrumentType}>
                <SelectTrigger>
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
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date/Time</Label>
              <Input
                type="datetime-local"
                value={modalStartDate}
                onChange={(e) => setModalStartDate(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Data will be shown up to this point. Only past data is used for AI.
              </p>
            </div>
            {modalError && (
              <p className="text-sm text-destructive">{modalError}</p>
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

      {/* Edit modal */}
      <Dialog open={editModalOpen} onOpenChange={setEditModalOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Edit Instrument Name</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              placeholder="e.g., Copper"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditModalOpen(false)} disabled={editLoading}>
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editLoading || !editName.trim()}>
              {editLoading ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
