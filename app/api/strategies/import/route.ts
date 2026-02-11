import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/** Matches export format from /api/settings/export/strategies */
interface ExportedStrategy {
  id?: string;
  name: string;
  description?: string | null;
  rules: string;
  version?: number;
  createdAt?: string;
  updatedAt?: string;
}

interface ImportPayload {
  exportedAt?: string;
  count?: number;
  strategies: ExportedStrategy[];
}

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string') return undefined;
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as ImportPayload;

    let strategies: ExportedStrategy[];
    if (Array.isArray(body.strategies)) {
      strategies = body.strategies;
    } else if (body && typeof body === 'object' && 'strategies' in body) {
      strategies = body.strategies;
    } else {
      return NextResponse.json(
        { error: 'Invalid format: expected { strategies: [...] } or export file format' },
        { status: 400 }
      );
    }

    if (!Array.isArray(strategies) || strategies.length === 0) {
      return NextResponse.json(
        { error: 'No strategies to import' },
        { status: 400 }
      );
    }

    const created: { id: string; name: string }[] = [];

    for (const s of strategies) {
      if (typeof s.name !== 'string' || !s.name.trim()) {
        return NextResponse.json(
          { error: `Strategy missing required field "name"` },
          { status: 400 }
        );
      }
      if (typeof s.rules !== 'string') {
        return NextResponse.json(
          { error: `Strategy "${s.name}" missing required field "rules"` },
          { status: 400 }
        );
      }

      const createdAt = parseDate(s.createdAt) ?? new Date();
      const updatedAt = parseDate(s.updatedAt) ?? new Date();
      const version = typeof s.version === 'number' && s.version >= 1 ? s.version : 1;
      const description = s.description != null ? String(s.description) : null;

      const createdStrategy = await prisma.strategy.create({
        data: {
          name: s.name.trim(),
          description: description?.trim() || null,
          rules: s.rules,
          version,
          createdAt,
          updatedAt,
        },
      });

      created.push({ id: createdStrategy.id, name: createdStrategy.name });
    }

    return NextResponse.json({
      success: true,
      imported: created.length,
      strategies: created,
    });
  } catch (error: unknown) {
    console.error('Import strategies error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import strategies' },
      { status: 500 }
    );
  }
}
