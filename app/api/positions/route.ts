import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const createPositionSchema = z.object({
  signalId: z.string(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status');
    const signalId = searchParams.get('signalId');

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (signalId) {
      where.signalId = signalId;
    }

    const positions = await prisma.position.findMany({
      where,
      include: {
        signal: {
          include: {
            strategy: {
              select: {
                id: true,
                name: true,
              },
            },
            ohlcData: true,
          },
        },
        positionLogs: {
          orderBy: {
            candleTimestamp: 'asc',
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      data: positions,
      count: positions.length,
    });
  } catch (error: any) {
    console.error('Fetch positions error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { signalId } = createPositionSchema.parse(body);

    // Verify signal exists and get entry price
    const signal = await prisma.signal.findUnique({
      where: { id: signalId },
      include: { ohlcData: true },
    });

    if (!signal) {
      return NextResponse.json(
        { error: 'Signal not found' },
        { status: 404 }
      );
    }

    const position = await prisma.position.create({
      data: {
        signalId,
        entryPrice: signal.ohlcData?.close ?? undefined,
        entryConfirmedAt: new Date(),
        status: 'OPEN',
        currentCandleCount: 0,
      },
      include: {
        signal: {
          include: {
            strategy: true,
            ohlcData: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: position,
    });
  } catch (error: any) {
    console.error('Create position error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create position' },
      { status: 500 }
    );
  }
}
