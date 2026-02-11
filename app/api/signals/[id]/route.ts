import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const signal = await prisma.signal.findUnique({
      where: { id: params.id },
      include: {
        strategy: true,
        ohlcData: true,
        positions: true,
      },
    });

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: signal,
    });
  } catch (error: any) {
    console.error('Fetch signal error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch signal' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const signal = await prisma.signal.findUnique({
      where: { id: params.id },
      include: { positions: true },
    });

    if (!signal) {
      return NextResponse.json({ error: 'Signal not found' }, { status: 404 });
    }

    if (signal.positions.length > 0) {
      return NextResponse.json(
        { error: 'Cannot delete signal: it has linked positions. Delete positions first.' },
        { status: 400 }
      );
    }

    await prisma.signal.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true, message: 'Signal deleted' });
  } catch (error: any) {
    console.error('Delete signal error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete signal' },
      { status: 500 }
    );
  }
}
