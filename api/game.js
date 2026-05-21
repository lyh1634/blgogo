// api/game.js - 使用原生 fetch（Node.js 18+ 自带）
export default async function handler(req, res) {
  // 处理 CORS 预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const gameState = req.body;
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({ error: '缺少 DEEPSEEK_API_KEY 环境变量' });
    }

    // 调用 DeepSeek API
    const aiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: '你是一个 BL 恋爱游戏叙事引擎，请返回 JSON 格式的剧情和数值变化。' },
          { role: 'user', content: JSON.stringify(gameState) }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      }),
    });

    const data = await aiResponse.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);

    // 返回给前端
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(parsed);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: '服务器内部错误' });
  }
}
