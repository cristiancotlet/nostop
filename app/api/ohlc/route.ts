import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function DELETE(request: NextRequest) {
  try {
    // OHLCData has onDelete SetNull on Signal/PositionLog – positions/signals keep history
    const result = await prisma.oHLCData.deleteMany({});
    const ohlcCount = result.count;

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${ohlcCount} OHLC data records. Signals and positions keep their history.`,
      deletedCount: ohlcCount,
    });
  } catch (error: any) {
    console.error('Delete OHLC data error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete OHLC data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const instrument = searchParams.get('instrument');
    const timeframe = searchParams.get('timeframe');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const limit = parseInt(searchParams.get('limit') || '1000');

    const where: any = {};

    if (instrument) {
      where.instrument = instrument;
    }

    if (timeframe) {
      where.timeframe = timeframe;
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

    const data = await prisma.oHLCData.findMany({
      where,
      orderBy: {
        timestamp: 'asc',
      },
      take: limit,
    });

    return NextResponse.json({
      success: true,
      data,
      count: data.length,
    });
  } catch (error: any) {
    console.error('Fetch OHLC error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch OHLC data' },
      { status: 500 }
    );
  }
}
