// api/game.js - CommonJS 版本（兼容性最好）
module.exports = async function handler(req, res) {
  // 处理 CORS 预检
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const gameState = req.body;
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      res.status(500).json({ error: '缺少 DEEPSEEK_API_KEY 环境变量' });
      return;
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
          {
            role: 'system',
            content: '你是一个 BL 恋爱游戏叙事引擎，请严格返回 JSON 格式，包含 story_text、stats_update、choices 三个字段。'
          },
          {
            role: 'user',
            content: JSON.stringify(gameState)
          }
        ],
        temperature: 0.8,
        response_format: { type: 'json_object' }
      }),
    });

    const data = await aiResponse.json();
    const content = data.choices[0].message.content;
    const parsed = JSON.parse(content);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(200).json(parsed);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: '服务器内部错误: ' + error.message });
  }
};
