import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { parse } from 'csv-parse/sync';
import { z } from 'zod';

// Schema for CSV with time column (no instrument/timeframe)
const ohlcRowSchemaTime = z.object({
  time: z.string(),
  open: z.string().transform(Number),
  high: z.string().transform(Number),
  low: z.string().transform(Number),
  close: z.string().transform(Number),
});

// Schema for CSV with timestamp column (no instrument/timeframe)
const ohlcRowSchemaTimestamp = z.object({
  timestamp: z.string(),
  open: z.string().transform(Number),
  high: z.string().transform(Number),
  low: z.string().transform(Number),
  close: z.string().transform(Number),
});

// Schema for CSV with all columns
const ohlcRowSchemaFull = z.object({
  timestamp: z.string().optional(),
  time: z.string().optional(),
  instrument: z.string(),
  timeframe: z.string(),
  open: z.string().transform(Number),
  high: z.string().transform(Number),
  low: z.string().transform(Number),
  close: z.string().transform(Number),
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const instrument = formData.get('instrument') as string;
    const timeframe = formData.get('timeframe') as string;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // If instrument/timeframe not provided, try to infer from filename
    let finalInstrument = instrument;
    let finalTimeframe = timeframe;

    if (!finalInstrument || !finalTimeframe) {
      const filename = file.name.toLowerCase();
      // Try to extract instrument from filename (e.g., COMEX-HG.csv -> Copper)
      if (filename.includes('comex') || filename.includes('hg')) {
        finalInstrument = finalInstrument || 'Copper';
      }
      // Default timeframe to 2h if not specified
      finalTimeframe = finalTimeframe || '2h';
    }

    if (!finalInstrument || !finalTimeframe) {
      return NextResponse.json(
        { error: 'Instrument and timeframe are required. Please provide them or ensure filename contains instrument info.' },
        { status: 400 }
      );
    }

    const text = await file.text();
    const records = parse(text, {
      columns: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      return NextResponse.json({ error: 'No data found in CSV file' }, { status: 400 });
    }

    // Check which schema to use based on column names
    const firstRecord = records[0];
    const hasTime = 'time' in firstRecord;
    const hasTimestamp = 'timestamp' in firstRecord;
    const hasInstrument = 'instrument' in firstRecord;
    const hasTimeframe = 'timeframe' in firstRecord;

    let validatedRecords: any[];

    if (hasInstrument && hasTimeframe && (hasTimestamp || hasTime)) {
      // Full schema with all columns
      validatedRecords = records.map((record: any) => {
        const data = ohlcRowSchemaFull.parse(record);
        return {
          timestamp: data.timestamp || data.time,
          instrument: data.instrument,
          timeframe: data.timeframe,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        };
      });
    } else if (hasTime) {
      // Schema with 'time' column
      validatedRecords = records.map((record: any) => {
        const data = ohlcRowSchemaTime.parse(record);
        return {
          timestamp: data.time,
          instrument: finalInstrument!,
          timeframe: finalTimeframe!,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        };
      });
    } else if (hasTimestamp) {
      // Schema with 'timestamp' column
      validatedRecords = records.map((record: any) => {
        const data = ohlcRowSchemaTimestamp.parse(record);
        return {
          timestamp: data.timestamp,
          instrument: finalInstrument!,
          timeframe: finalTimeframe!,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
        };
      });
    } else {
      return NextResponse.json(
        { error: 'CSV must contain either "time" or "timestamp" column, and optionally "instrument" and "timeframe" columns' },
        { status: 400 }
      );
    }

    const results = await prisma.$transaction(
      validatedRecords.map((record) =>
        prisma.oHLCData.create({
          data: {
            timestamp: new Date(record.timestamp),
            instrument: record.instrument,
            timeframe: record.timeframe,
            open: record.open,
            high: record.high,
            low: record.low,
            close: record.close,
          },
        })
      )
    );

    // Process position logs for imported candles (only for the latest/newest candles)
    // Group by instrument/timeframe and process only the newest candle for each
    if (results.length > 0) {
      const { processPositionLogsForNewCandle } = await import('@/lib/position-log-processor');
      
      // Group by instrument/timeframe and get the latest candle for each
      const latestByGroup = new Map<string, typeof results[0]>();
      for (const candle of results) {
        const key = `${candle.instrument}:${candle.timeframe}`;
        const existing = latestByGroup.get(key);
        if (!existing || candle.timestamp > existing.timestamp) {
          latestByGroup.set(key, candle);
        }
      }

      // Process position logs for each latest candle (non-blocking)
      for (const candle of latestByGroup.values()) {
        processPositionLogsForNewCandle(candle.id, candle.instrument, candle.timeframe).catch((error) => {
          console.error(`Error processing position logs for imported candle ${candle.id}:`, error);
        });
      }
    }

    return NextResponse.json({
      success: true,
      count: results.length,
      message: `Imported ${results.length} OHLC records`,
    });
  } catch (error: any) {
    console.error('CSV import error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid CSV format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to import CSV' },
      { status: 500 }
    );
  }
}
