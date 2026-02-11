import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const bodySchema = z.object({
  type: z.enum(['data', 'strategies', 'signals', 'positions']),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type } = bodySchema.parse(body);

    switch (type) {
      case 'data': {
        // OHLCData: SetNull on Signal/PositionLog – positions/signals keep history
        await prisma.oHLCData.deleteMany({});
        await prisma.backtestOHLC.deleteMany({});
        await prisma.backtestDataset.deleteMany({});
        break;
      }
      case 'strategies': {
        // Strategy: SetNull on Signal – signals remain (AILearning cascades)
        await prisma.strategy.deleteMany({});
        break;
      }
      case 'signals': {
        // Only delete signals not linked to any position
        await prisma.signal.deleteMany({
          where: { positions: { none: {} } },
        });
        break;
      }
      case 'positions': {
        // Delete signals that had positions (orphan signals with no positions stay)
        const signalsWithPositions = await prisma.signal.findMany({
          where: { positions: { some: {} } },
          select: { id: true },
        });
        const signalIdsToDelete = signalsWithPositions.map((s) => s.id);

        await prisma.positionLog.deleteMany({});
        await prisma.position.deleteMany({});
        if (signalIdsToDelete.length > 0) {
          await prisma.signal.deleteMany({ where: { id: { in: signalIdsToDelete } } });
        }
        break;
      }
    }

    return NextResponse.json({
      success: true,
      message: `Cleared ${type} successfully`,
    });
  } catch (error: any) {
    console.error('Clear data error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid type', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to clear data' },
      { status: 500 }
    );
  }
}
