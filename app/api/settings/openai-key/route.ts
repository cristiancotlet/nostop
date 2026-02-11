import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/encryption';
import { z } from 'zod';

const KEY = 'openai_api_key';

export async function GET() {
  try {
    const row = await prisma.appSetting.findUnique({
      where: { key: KEY },
    });
    return NextResponse.json({
      configured: !!row?.value,
    });
  } catch (error: any) {
    console.error('Get OpenAI key status error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to check status' },
      { status: 500 }
    );
  }
}

const postSchema = z.object({
  apiKey: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { apiKey } = postSchema.parse(body);

    const encrypted = encrypt(apiKey);
    await prisma.appSetting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: encrypted },
      update: { value: encrypted },
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Save OpenAI key error:', error);
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to save API key' },
      { status: 500 }
    );
  }
}
