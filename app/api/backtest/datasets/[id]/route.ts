import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const dataset = await prisma.backtestDataset.findUnique({
      where: { id: params.id },
      include: {
        ohlc: {
          orderBy: { timestamp: 'asc' },
        },
      },
    });

    if (!dataset) {
      return NextResponse.json(
        { error: 'Dataset not found' },
        { status: 404 }
      );
    }

    const data = {
      id: dataset.id,
      name: dataset.name,
      instrumentType: dataset.instrumentType,
      timeframe: dataset.timeframe,
      startDate: dataset.startDate.toISOString(),
      ohlc: dataset.ohlc.map((o) => ({
        timestamp: o.timestamp.toISOString(),
        open: o.open,
        high: o.high,
        low: o.low,
        close: o.close,
      })),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Get backtest dataset error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get dataset' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { name, instrumentType } = body;
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Valid name required' }, { status: 400 });
    }
    const updateData: { name: string; instrumentType?: string } = { name: name.trim() };
    if (instrumentType && ['GC', 'HG', 'CL', 'NG'].includes(instrumentType)) {
      updateData.instrumentType = instrumentType;
    }
    const dataset = await prisma.backtestDataset.update({
      where: { id: params.id },
      data: updateData,
    });
    return NextResponse.json({
      success: true,
      data: {
        id: dataset.id,
        name: dataset.name,
        instrumentType: dataset.instrumentType,
        timeframe: dataset.timeframe,
        startDate: dataset.startDate.toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Update backtest dataset error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update dataset' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.backtestDataset.delete({
      where: { id: params.id },
    });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete backtest dataset error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete dataset' },
      { status: 500 }
    );
  }
}
