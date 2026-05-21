// api/game.js - 完整可工作版本
module.exports = async function handler(req, res) {
  // 设置 CORS 头，允许前端跨域访问
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // 处理预检请求（OPTIONS）
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // 只允许 POST 请求
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    // 从环境变量获取 DeepSeek API Key
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
      console.error('缺少 DEEPSEEK_API_KEY 环境变量');
      res.status(500).json({ error: '服务器配置错误：缺少 API Key' });
      return;
    }

    // 获取前端发送的完整游戏状态
    const gameState = req.body;
    console.log('收到请求，action:', gameState.action);

    // 根据不同的 action 返回不同的响应（这里先返回测试数据）
    // 如果你希望接入真正的 DeepSeek API，可以在这里添加调用逻辑
    // 目前先返回一个测试响应，确保前后端通信正常
    
    const testResponse = {
      storyText: "系统已连接。这是一个测试剧情，说明后端正常工作。你可以继续设置 DeepSeek API 来生成真实内容。",
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
        likes: "待生成",
        dislikes: "待生成"
      })),
      choices: ["【系统建议】前往塔的训练室", "【保持沉默】观察他的反应", "【介入】主动提供精神安抚"],
      missionHint: "等待触发副本任务",
      world: gameState.world || "未知副本",
      specialProgress: 0,
      gameOver: false
    };

    res.status(200).json(testResponse);
  } catch (error) {
    console.error('处理请求时出错:', error);
    res.status(500).json({ error: '服务器内部错误：' + error.message });
  }
};
