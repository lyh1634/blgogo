// api/game.js
import fetch from 'node-fetch';

export default async function handler(req, res) {
    // 设置跨域头，让前端网页能够调用
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { protagonist, loveInterests, history, choice } = req.body;
    
    // 从环境变量中安全地读取你的DeepSeek API Key
    const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
    if (!DEEPSEEK_API_KEY) {
        return res.status(500).json({ error: 'DeepSeek API Key 未配置' });
    }

    // 构建系统提示词 System Prompt（核心）
    const systemPrompt = `你是一个基于BL恋爱游戏的叙事引擎，需要根据玩家的选择推进剧情并更新数值。
    
    玩家选择的角色是：【主角：${protagonist.name}（${protagonist.mbti}）】。
    攻略角色有：${loveInterests.map(li => `${li.name}（${li.mbti}）`).join('、')}。
    
    你必须始终以JSON格式返回，包含以下字段：
    {
        "story_text": "此处为剧情描述，需细腻、有沉浸感，符合BL恋爱小说风格。",
        "stats_update": {
            "protagonist_health": 数字,
            "system_trust": 数字,
            "target_favorability": 数字,
            "target_jealousy": 数字
        },
        "choices": ["选项A", "选项B", "选项C"]
    }
    
    请确保好感度变化符合角色的MBTI性格特征。`;
    
    // 构建用户消息（包含游戏历史与当前选择）
    const userMessage = `【游戏历史】\n${history || '游戏开始'}\n\n【玩家选择】\n${choice}\n\n请基于以上信息生成下一段剧情、更新数值和提供新的选项。`;
    
    try {
        const apiResponse = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                temperature: 0.8,
                response_format: { type: 'json_object' }
            })
        });
        
        const data = await apiResponse.json();
        const aiMessage = data.choices[0].message.content;
        const parsedJson = JSON.parse(aiMessage);
        
        return res.status(200).json({
            story_text: parsedJson.story_text,
            stats_update: parsedJson.stats_update,
            choices: parsedJson.choices
        });
        
    } catch (error) {
        console.error('AI调用失败:', error);
        return res.status(500).json({ error: 'AI服务繁忙，请稍后再试' });
    }
}
