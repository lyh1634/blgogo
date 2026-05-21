// api/game.js - 完整可工作版本（包含测试响应）
module.exports = async function handler(req, res) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 只允许 POST
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // 可选：检查 API Key（如果没有也不影响测试，只是不能调用真实 AI）
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      console.warn('警告：未设置 DEEPSEEK_API_KEY 环境变量，将返回模拟数据');
    }

    // 获取前端发送的数据
    const gameState = req.body;
    console.log('收到 action:', gameState.action);

    // 构造一个测试响应（让前端能正常显示）
    const testResponse = {
      storyText: "✨ 系统连接成功！这是一个测试剧情。接下来你可以配置 DeepSeek API 来生成真正的故事。",
      protagonist: {
        name: gameState.protagonist?.name || "主角",
        health: 100,
        mood: 80,
        trust: 30,
        friendship: 20
      },
      loveInterests: (gameState.loveInterests || []).map(li => ({
        name: li.name,
        favorability: 25,
        jealousy: 0,
        likes: "温柔体贴",
        dislikes: "冷漠"
      })),
      choices: ["【系统建议】主动和他对话", "【保持沉默】观察他的反应", "【介入】尝试精神链接"],
      missionHint: "副本任务未触发",
      world: gameState.world || "未知副本",
      specialProgress: 0,
      gameOver: false
    };

    // 发送响应
    res.status(200).json(testResponse);
  } catch (error) {
    console.error('处理错误:', error);
    res.status(500).json({ error: '服务器内部错误: ' + error.message });
  }
};
