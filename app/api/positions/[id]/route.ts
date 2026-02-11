import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const deleteSignal = request.nextUrl.searchParams.get('deleteSignal') === 'true';

    const position = await prisma.position.findUnique({
      where: { id: params.id },
      include: {
        signal: {
          include: {
            _count: { select: { positions: true } },
          },
        },
      },
    });

    if (!position) {
      return NextResponse.json({ error: 'Position not found' }, { status: 404 });
    }

    const signalId = position.signalId;

    await prisma.positionLog.deleteMany({ where: { positionId: params.id } });
    await prisma.position.delete({ where: { id: params.id } });

    if (deleteSignal && position.signal && position.signal._count.positions <= 1) {
      await prisma.signal.delete({ where: { id: signalId } });
    }

    return NextResponse.json({ success: true, message: 'Position deleted' });
  } catch (error: any) {
    console.error('Delete position error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete position' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const position = await prisma.position.findUnique({
      where: { id: params.id },
      include: {
        signal: {
          include: {
            strategy: true,
            ohlcData: true,
          },
        },
        positionLogs: {
          include: {
            ohlcData: true,
          },
          orderBy: {
            candleTimestamp: 'asc',
          },
        },
      },
    });

    if (!position) {
      return NextResponse.json(
        { error: 'Position not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: position,
    });
  } catch (error: any) {
    console.error('Fetch position error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch position' },
      { status: 500 }
    );
  }
}
