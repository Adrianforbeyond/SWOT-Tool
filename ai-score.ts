// Vercel Serverless Function (Edge Runtime)
// Dependencies: openai, zod
// Env: OPENAI_API_KEY

import { z } from 'zod';
import OpenAI from 'openai';

export const config = { runtime: 'edge' };

const FIB = [
  1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597,
] as const;
const snapFib = (n: number) =>
  FIB.reduce((p, c) => (Math.abs(c - n) < Math.abs(p - n) ? c : p));

const Body = z.object({
  scenario: z.object({
    name: z.string(),
    description: z.string().optional(),
  }),
  criteria: z.object({
    S: z.array(z.object({ id: z.string(), text: z.string() })),
    W: z.array(z.object({ id: z.string(), text: z.string() })),
    O: z.array(z.object({ id: z.string(), text: z.string() })),
    T: z.array(z.object({ id: z.string(), text: z.string() })),
  }),
  mode: z.literal('deep_research').optional(),
});

const systemPrompt = `Bewerte EIN einzelnes SWOT-Kriterium numerisch auf Fibonacci-Skala.
Erlaubte Werte: 0 (irrelevant/unbewertbar) ODER 1,2,3,5,8,13,21,34,55,89,144,233,377,610,987,1597.
Antworte NUR als kompaktes JSON:
{"score": <number>, "rationale":"<max 60 Wörter>"}.`;

async function scoreOne(openai: OpenAI, text: string) {
  const r = await openai.chat.completions.create({
    model: 'gpt-4o-mini', // wähle dein Modell
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Kriterium: "${text}"` },
    ],
  });
  const payload = JSON.parse(r.choices[0]?.message?.content || '{}');
  const raw = typeof payload.score === 'number' ? payload.score : 0;
  return snapFib(raw);
}

export default async function handler(req: Request) {
  if (req.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }
  const parsed = Body.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify(parsed.error.format()), {
      status: 400,
      headers: { 'content-type': 'application/json' },
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { criteria } = parsed.data;

  const out: Record<'S' | 'W' | 'O' | 'T', Record<string, number>> = {
    S: {},
    W: {},
    O: {},
    T: {},
  };

  for (const area of ['S', 'W', 'O', 'T'] as const) {
    const list = criteria[area];
    const results = await Promise.all(
      list.map(async (c) => ({ id: c.id, v: await scoreOne(openai, c.text) }))
    );
    for (const r of results) out[area][r.id] = r.v;
  }

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}
