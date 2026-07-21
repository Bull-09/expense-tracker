import OpenAI from 'openai';
import { getCurrentProfile } from '@/lib/data/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function jsonFromOutput(value: string) {
  const match = value.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('The receipt could not be read.');
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile) return Response.json({ error: 'Please sign in again.' }, { status: 401 });
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: 'Receipt scanning is not configured.' }, { status: 503 });

  const form = await request.formData();
  const image = form.get('image');
  if (!(image instanceof File) || !image.type.startsWith('image/')) return Response.json({ error: 'Choose a receipt or screenshot image.' }, { status: 400 });
  if (image.size > 4 * 1024 * 1024) return Response.json({ error: 'The processed image must be under 4 MB.' }, { status: 400 });

  const dataUrl = `data:${image.type};base64,${Buffer.from(await image.arrayBuffer()).toString('base64')}`;
  try {
    const openai = new OpenAI({ apiKey });
    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_VISION_MODEL ?? 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 500,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'Read this receipt, invoice, or payment screenshot. Return JSON only: {merchant:string,total:number|null,date:string|null,lineItems:[{name:string,amount:number|null}],suggestedCategory:string|null,confidence:number}. Never invent unreadable values.' },
        { type: 'image_url', image_url: { url: dataUrl, detail: 'low' } },
      ] }],
    });
    const parsed = jsonFromOutput(completion.choices[0]?.message?.content ?? '');
    return Response.json({ ...parsed, usage: completion.usage ? { promptTokens: completion.usage.prompt_tokens, completionTokens: completion.usage.completion_tokens, totalTokens: completion.usage.total_tokens } : null });
  } catch (error) {
    console.error('Receipt scan failed', error);
    return Response.json({ error: 'I could not read this image. You can still enter the fields manually.' }, { status: 422 });
  }
}
