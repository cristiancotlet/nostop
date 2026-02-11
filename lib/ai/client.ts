import OpenAI from 'openai';
import { prisma } from '@/lib/db';
import { decrypt } from '@/lib/encryption';

const KEY = 'openai_api_key';

export async function getOpenAIClient(): Promise<OpenAI> {
  const envKey = process.env.OPENAI_API_KEY;
  if (envKey) {
    return new OpenAI({ apiKey: envKey });
  }

  const row = await prisma.appSetting.findUnique({
    where: { key: KEY },
  });
  if (!row?.value) {
    throw new Error(
      'OpenAI API key not configured. Add it in Settings or set OPENAI_API_KEY env var.'
    );
  }

  const apiKey = decrypt(row.value);
  return new OpenAI({ apiKey });
}
