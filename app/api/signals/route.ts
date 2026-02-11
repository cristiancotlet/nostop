import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const instrument = searchParams.get('instrument');
    const timeframe = searchParams.get('timeframe');
    const signalType = searchParams.get('signal');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '100');

    const where: any = {};

    if (instrument) {
      where.instrument = instrument;
    }

    if (timeframe) {
      where.timeframe = timeframe;
    }

    if (signalType) {
      where.signal = signalType;
    }

    if (startDate || endDate) {
      where.timestamp = {};
      if (startDate) {
        where.timestamp.gte = new Date(startDate);
      }
      if (endDate) {
        where.timestamp.lte = new Date(endDate);
      }
    }

    const signals = await prisma.signal.findMany({
      where,
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
          },
        },
        ohlcData: true,
      },
      orderBy: {
        timestamp: 'desc',
      },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data: signals,
      count: signals.length,
    });
  } catch (error: any) {
    console.error('Fetch signals error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch signals' },
      { status: 500 }
    );
  }
}
