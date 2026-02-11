import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const updateStrategySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  rules: z.string().min(1).optional(),
});

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const strategy = await prisma.strategy.findUnique({
      where: { id: params.id },
      include: {
        signals: {
          take: 20,
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!strategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    const positions = await prisma.position.findMany({
      where: {
        signal: { strategyId: params.id },
        status: 'CLOSED',
        learningInsights: { not: null },
      },
      orderBy: { createdAt: 'asc' },
      include: {
        signal: {
          select: { instrument: true, timeframe: true, timestamp: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: { ...strategy, positions },
    });
  } catch (error: any) {
    console.error('Fetch strategy error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch strategy' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const updateData = updateStrategySchema.parse(body);

    // Get current strategy to increment version
    const currentStrategy = await prisma.strategy.findUnique({
      where: { id: params.id },
    });

    if (!currentStrategy) {
      return NextResponse.json(
        { error: 'Strategy not found' },
        { status: 404 }
      );
    }

    const strategy = await prisma.strategy.update({
      where: { id: params.id },
      data: {
        ...updateData,
        version: currentStrategy.version + 1,
      },
    });

    return NextResponse.json({
      success: true,
      data: strategy,
    });
  } catch (error: any) {
    console.error('Update strategy error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to update strategy' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.strategy.delete({
      where: { id: params.id },
    });

    return NextResponse.json({
      success: true,
      message: 'Strategy deleted successfully',
    });
  } catch (error: any) {
    console.error('Delete strategy error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to delete strategy' },
      { status: 500 }
    );
  }
}
