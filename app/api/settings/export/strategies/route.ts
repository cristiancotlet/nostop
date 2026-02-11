import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  try {
    const strategies = await prisma.strategy.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        rules: true,
        version: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    const exportData = {
      exportedAt: new Date().toISOString(),
      count: strategies.length,
      strategies,
    };

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="strategies-export-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    });
  } catch (error: any) {
    console.error('Export strategies error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to export strategies' },
      { status: 500 }
    );
  }
}
