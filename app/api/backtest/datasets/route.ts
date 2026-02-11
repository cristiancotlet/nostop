import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';
export async function GET() {
  try {
    const datasets = await prisma.backtestDataset.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        instrumentType: true,
        timeframe: true,
        startDate: true,
        createdAt: true,
        _count: { select: { ohlc: true } },
      },
    });
    const data = datasets.map((d) => ({
      id: d.id,
      name: d.name,
      instrumentType: d.instrumentType,
      timeframe: d.timeframe,
      startDate: d.startDate,
      createdAt: d.createdAt,
      candleCount: d._count.ohlc,
    }));
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('List backtest datasets error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to list datasets' },
      { status: 500 }
    );
  }
}

const VALID_INSTRUMENT_TYPES = ['GC', 'HG', 'CL', 'NG'] as const;

const importSchema = z.object({
  name: z.string().min(1),
  instrumentType: z.enum(VALID_INSTRUMENT_TYPES),
  timeframe: z.string().min(1),
  startDate: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const name = formData.get('name') as string;
    const instrumentType = formData.get('instrumentType') as string;
    const timeframe = formData.get('timeframe') as string;
    const startDateStr = formData.get('startDate') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const parsed = importSchema.parse({ name, instrumentType, timeframe, startDate: startDateStr });
    const startDate = new Date(parsed.startDate);
    if (isNaN(startDate.getTime())) {
      return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    }

    const text = await file.text();
    const records = parse(text, { columns: true, skip_empty_lines: true });

    if (records.length === 0) {
      return NextResponse.json({ error: 'No data found in CSV file' }, { status: 400 });
    }

    const first = records[0];
    const hasTime = 'time' in first;
    const hasTimestamp = 'timestamp' in first;
    const hasDate = 'date' in first;
    if (!hasTime && !hasTimestamp && !hasDate) {
      return NextResponse.json(
        { error: 'CSV must contain "time", "timestamp" or "date" column' },
        { status: 400 }
      );
    }

    const timeCol = hasTime ? 'time' : hasTimestamp ? 'timestamp' : 'date';
    const ohlcRows: Array<{ timestamp: Date; open: number; high: number; low: number; close: number }> = [];

    for (const record of records) {
      const rawTime = record[timeCol];
      const open = parseFloat(record.open);
      const high = parseFloat(record.high);
      const low = parseFloat(record.low);
      const close = parseFloat(record.close);
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) continue;
      const ts = new Date(rawTime);
      if (isNaN(ts.getTime())) continue;
      ohlcRows.push({ timestamp: ts, open, high, low, close });
    }

    if (ohlcRows.length === 0) {
      return NextResponse.json({ error: 'No valid rows in CSV' }, { status: 400 });
    }

    ohlcRows.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    const dataset = await prisma.backtestDataset.create({
      data: {
        name: parsed.name,
        instrumentType: parsed.instrumentType,
        timeframe: parsed.timeframe,
        startDate,
      },
    });

    await prisma.backtestOHLC.createMany({
      data: ohlcRows.map((r) => ({
        datasetId: dataset.id,
        timestamp: r.timestamp,
        open: r.open,
        high: r.high,
        low: r.low,
        close: r.close,
      })),
    });

    return NextResponse.json({
      success: true,
      data: {
        id: dataset.id,
        name: dataset.name,
        timeframe: dataset.timeframe,
        startDate: dataset.startDate.toISOString(),
        count: ohlcRows.length,
      },
    });
  } catch (error: any) {
    console.error('Backtest import error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to import' },
      { status: 500 }
    );
  }
}
