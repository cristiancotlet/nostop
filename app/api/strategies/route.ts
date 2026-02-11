import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const strategySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  rules: z.string().min(1),
});

export async function GET() {
  try {
    const strategies = await prisma.strategy.findMany({
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({
      success: true,
      data: strategies,
    });
  } catch (error: any) {
    console.error('Fetch strategies error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch strategies' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = strategySchema.parse(body);

    const strategy = await prisma.strategy.create({
      data,
    });

    return NextResponse.json({
      success: true,
      data: strategy,
    });
  } catch (error: any) {
    console.error('Create strategy error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid data format', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to create strategy' },
      { status: 500 }
    );
  }
}
