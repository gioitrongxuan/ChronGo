import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { hourly, targetStr } = await req.json();

    const apiKey = Deno.env.get('DEEPSEEK_API_KEY');
    if (!apiKey) return json({ error: 'DEEPSEEK_API_KEY not set on server' }, 500);

    const prompt = `Dữ liệu hiệu quả làm việc theo giờ địa phương:
${JSON.stringify(hourly)}
Mục tiêu: ${targetStr}

Trả về JSON, không có text khác:
{"hourly":[{"hour":0,"efficiency":0},…,{"hour":23,"efficiency":0}],"peaks":[{"start":9,"end":11,"label":"Tên đỉnh","efficiency":87}],"summary":"nhận xét 1-2 câu tiếng Việt"}`;

    const upstream = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Productivity analytics assistant. Return ONLY valid JSON, no markdown, no explanation.' },
          { role: 'user',   content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text();
      return json({ error: `DeepSeek HTTP ${upstream.status}`, detail }, 502);
    }

    const raw    = await upstream.json();
    const result = JSON.parse(raw.choices[0].message.content);
    return json(result);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
