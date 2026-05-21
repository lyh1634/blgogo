// api/game.js
// BL恋爱游戏《上帝之手》后端 - 系统辅助主角与攻略角色恋爱

module.exports = async (req, res) => {
  // CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { action, ...state } = req.body;

    if (action === 'init') {
      const initState = await initGame(state);
      return res.status(200).json(initState);
    }
    if (action === 'step') {
      const newState = await stepGame(state);
      return res.status(200).json(newState);
    }
    if (action === 'shop') {
      const shopItems = getShopItems();
      return res.status(200).json({ shopItems });
    }
    if (action === 'buy') {
      const newState = await buyItem(state);
      return res.status(200).json(newState);
    }
    return res.status(400).json({ error: '未知 action' });
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
};

// ---------- 初始化 ----------
async function initGame(data) {
  const { protagonist: proto, loveInterests: loveList, world } = data;

  // 生成主角完整信息
  const protagonist = {
    name: proto.name,
    group: proto.group || '',
    birthday: proto.birthday || '',
    mbti: proto.mbti || 'INFP',
    health: 100,
    mood: 70,
    trust: 25,      // 主角对玩家的信任度
    friendship: 15, // 主角与玩家的友情值
  };

  // 生成攻略角色（初始好感度 20±5，妒忌值 0）
  const loveInterests = loveList.map(li => ({
    name: li.name,
    group: li.group || '',
    birthday: li.birthday || '',
    mbti: li.mbti || 'ENFJ',
    favorability: 20 + Math.floor(Math.random() * 10) - 5, // 15~25
    jealousy: 0,
    likes: generateLikes(li.mbti),
    dislikes: generateDislikes(li.mbti),
  }));

  // 副本特殊进度
  let specialProgress = 0;
  let specialName = '';
  if (world.includes('哨向导')) specialName = '武力值';
  else if (world.includes('电竞')) specialName = '游戏实力';
  else if (world.includes('末世')) specialName = '基建进度';
  else if (world.includes('换乘')) specialName = '拍摄进度';
  else if (world.includes('规则怪谈')) specialName = '武力值';

  // 初始剧情
  const storyText = `【${world}】\n\n作为系统，你将主角${protagonist.name}传送至副本世界。\n${getWorldIntro(world)}\n\n你现在可以通过「系统建议」引导主角的行动。`;
  const choices = generateInitialChoices(world);

  return {
    protagonist,
    loveInterests,
    world,
    storyText,
    choices,
    missionHint: getMissionHint(world, specialProgress),
    specialProgress,
    specialName,
    gameOver: false,
    gameOverReason: '',
    storyHistory: storyText,
    // 副本触发标志
    finalBattleTriggered: false,
    finalBattleCountdown: 0,
    worldsTriggered: false,
    worldsCountdown: 0,
  };
}

// ---------- 剧情推进 ----------
async function stepGame(state) {
  let newState = JSON.parse(JSON.stringify(state));
  const { protagonist, loveInterests, world, storyHistory, lastChoice, specialProgress, specialName } = newState;

  // 调用 DeepSeek 生成剧情和数值建议
  let aiResponse;
  try {
    aiResponse = await callDeepSeek(newState);
  } catch (err) {
    console.error('DeepSeek 调用失败，使用模拟响应', err);
    aiResponse = getMockResponse(newState);
  }

  const { story_text, stats_update, choices } = aiResponse;

  // 应用数值变化
  if (stats_update) {
    if (stats_update.health) protagonist.health = clamp(protagonist.health + stats_update.health, 0, 100);
    if (stats_update.mood) protagonist.mood = clamp(protagonist.mood + stats_update.mood, 0, 100);
    if (stats_update.trust) protagonist.trust = clamp(protagonist.trust + stats_update.trust, 0, 100);
    if (stats_update.friendship) protagonist.friendship = clamp(protagonist.friendship + stats_update.friendship, 0, 100);
    if (stats_update.special) newState.specialProgress = clamp(newState.specialProgress + stats_update.special, 0, 100);

    // 好感度变化
    if (stats_update.favorability) {
      for (let change of stats_update.favorability) {
        const target = loveInterests.find(li => li.name === change.name);
        if (target) target.favorability = clamp(target.favorability + change.delta, 0, 100);
      }
    }
    // 妒忌值变化
    if (stats_update.jealousy) {
      for (let change of stats_update.jealousy) {
        const target = loveInterests.find(li => li.name === change.name);
        if (target) target.jealousy = clamp(target.jealousy + change.delta, 0, 100);
      }
    }
  }

  // 检查好感度触发关系阶段（用于前端显示，这里只是更新，前端会重新渲染）
  // 副本任务触发：任意攻略角色好感度 ≥ 70
  const maxFavor = Math.max(...loveInterests.map(li => li.favorability));
  if (!newState.finalBattleTriggered && maxFavor >= 70 && world.includes('哨向导')) {
    newState.finalBattleTriggered = true;
    newState.finalBattleCountdown = 7;
    newState.missionHint = `⚠️ 最终战役将在 ${newState.finalBattleCountdown} 天后爆发！`;
  }
  if (!newState.worldsTriggered && maxFavor >= 70 && world.includes('电竞')) {
    newState.worldsTriggered = true;
    newState.worldsCountdown = 7;
    newState.missionHint = `🏆 全球总决赛 ${newState.worldsCountdown} 天后开战！`;
  }

  // 副本任务完成判定（换乘：拍摄进度≥21；末世：基建进度≥100）
  if (world.includes('换乘') && newState.specialProgress >= 21) {
    newState.gameOver = true;
    newState.gameOverReason = '节目录制完成，你选择了新的开始。副本通关！';
  }
  if (world.includes('末世') && newState.specialProgress >= 100) {
    newState.gameOver = true;
    newState.gameOverReason = '基地建设完成，人类找到了希望。副本通关！';
  }
  // 哨向/电竞的最终战役/总决赛倒计时结束时的结算（需要在倒计时为0时触发，这里简化：由前端在倒计时归零时发step触发）
  // 健康值过低结束
  if (protagonist.health <= 5) {
    newState.gameOver = true;
    newState.gameOverReason = '主角健康值耗尽，未能撑到最后。';
  }

  newState.storyText = story_text;
  newState.choices = choices;
  newState.storyHistory = (newState.storyHistory ? newState.storyHistory + '\n\n' + story_text : story_text);
  if (newState.storyHistory.length > 8000) newState.storyHistory = newState.storyHistory.slice(-8000);

  return newState;
}

// ---------- 商店 ----------
function getShopItems() {
  return [
    { id: 'delay_mission', name: '推迟副本任务', desc: '将倒计时任务推迟一周', cost: 30 },
    { id: 'peek_memory', name: '窥探记忆', desc: '了解某位攻略角色的过去', cost: 10 },
    { id: 'heal_potion', name: '治愈药剂', desc: '恢复20点健康值', cost: 15 },
    { id: 'mood_boost', name: '心情激励', desc: '增加20点心情值', cost: 10 },
  ];
}

async function buyItem(state) {
  let newState = JSON.parse(JSON.stringify(state));
  const { itemId, costCharacter, costValue } = state;
  const targetChar = newState.loveInterests.find(li => li.name === costCharacter);
  if (!targetChar || targetChar.favorability < costValue) {
    throw new Error('好感度不足');
  }
  targetChar.favorability -= costValue;
  // 道具效果
  if (itemId === 'delay_mission') {
    if (newState.finalBattleCountdown > 0) newState.finalBattleCountdown += 7;
    if (newState.worldsCountdown > 0) newState.worldsCountdown += 7;
    newState.missionHint = `任务已推迟。`;
  } else if (itemId === 'heal_potion') {
    newState.protagonist.health = clamp(newState.protagonist.health + 20, 0, 100);
  } else if (itemId === 'mood_boost') {
    newState.protagonist.mood = clamp(newState.protagonist.mood + 20, 0, 100);
  }
  newState.storyText = `【道具使用】${costCharacter}消耗了${costValue}好感度，换来了「${getShopItems().find(i=>i.id===itemId)?.name}」。\n\n` + (newState.storyText || '');
  return newState;
}

// ---------- 辅助函数 ----------
function clamp(val, min, max) { return Math.min(max, Math.max(min, val)); }

function generateLikes(mbti) {
  const map = {
    INFP: '真诚、艺术、安静陪伴',
    ENTP: '辩论、新奇、挑战',
    ENFJ: '帮助他人、社交、肯定',
    ISTP: '动手、独立、刺激',
    INTJ: '战略、深度、效率',
    ESFJ: '照顾、和谐、传统',
    ISFP: '美、自由、感官体验',
    ENTJ: '领导、成就、挑战',
    ENFP: '探索、可能性、热情',
  };
  return map[mbti] || '温柔、理解、陪伴';
}
function generateDislikes(mbti) {
  const map = {
    INFP: '虚伪、暴力、强迫',
    ENTP: '无聊、守旧、被束缚',
    ENFJ: '冷漠、不公、背叛',
    ISTP: '啰嗦、情绪化、规则',
    INTJ: '肤浅、打扰、混乱',
    ESFJ: '冲突、冷漠、变化',
    ISFP: '控制、压力、评判',
    ENTJ: '无能、拖延、软弱',
    ENFP: '例行公事、批评、束缚',
  };
  return map[mbti] || '冷漠、背叛、强迫';
}

function getWorldIntro(world) {
  if (world.includes('哨向导')) return '你身处一座巨大的星际塔，周围是银白色的金属墙壁，隐约能听见白噪音流淌。';
  if (world.includes('电竞')) return '这里是全球总决赛的舞台，灯光璀璨，观众欢呼。你坐在选手席上，屏幕闪烁着选英雄界面。';
  if (world.includes('末世')) return '街道一片混乱，远处传来尖叫声和爆炸声。丧尸病毒刚刚爆发，你必须带领幸存者建立安全区。';
  if (world.includes('换乘')) return '你提着行李走进一栋海边别墅，门上贴着“心动公寓”。这里即将开始21天的恋爱同居。';
  if (world.includes('规则怪谈')) return '你站在静默林边缘，面前竖着一块木牌，上面写着十条规则。';
  return '副本世界加载完成。';
}

function getMissionHint(world, progress) {
  if (world.includes('哨向导')) return '最终战役尚未触发';
  if (world.includes('电竞')) return '全球总决赛尚未触发';
  if (world.includes('末世')) return `建设安全基地 ${progress}%`;
  if (world.includes('换乘')) return `拍摄第${progress}/21天`;
  if (world.includes('规则怪谈')) return '找出刺杀国王的方法';
  return '探索副本';
}

function generateInitialChoices(world) {
  if (world.includes('哨向导')) {
    return ['【系统建议】前往塔的训练室', '【保持沉默】观察周围环境', '【主动】尝试感知其他人的精神体'];
  }
  if (world.includes('电竞')) {
    return ['【系统建议】打开排位训练', '【保持沉默】先和队友打招呼', '【主动】研究对手的战术'];
  }
  return ['【系统建议】仔细观察环境', '【保持沉默】先熟悉身边的人', '【主动】寻找线索'];
}

// ---------- DeepSeek API 调用 ----------
async function callDeepSeek(gameState) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('未设置 DEEPSEEK_API_KEY，使用模拟响应');
    return getMockResponse(gameState);
  }

  const systemPrompt = `你是BL恋爱游戏《上帝之手》的叙事引擎。玩家是「系统」，主角是爱豆（男性），攻略角色也是男性爱豆。玩家通过「系统建议」影响主角，但对话和互动发生在主角与攻略角色之间。

当前副本：${gameState.world}

主角信息：${gameState.protagonist.name}（${gameState.protagonist.mbti}）
攻略角色列表：${gameState.loveInterests.map(l => l.name).join('、')}

你必须以JSON格式返回，包含：
{
  "story_text": "剧情描述（200~400字），以主角视角或上帝视角，展现主角与攻略角色的互动。不要提及“系统”或“玩家”，除非是系统建议内容自然融入。",
  "stats_update": {
    "health": 整数（-15~+15）,
    "mood": 整数（-15~+15）,
    "trust": 整数（-5~+10）,
    "friendship": 整数（-5~+10）,
    "special": 整数（0~+10，副本特殊进度增量）,
    "favorability": [{"name": "攻略角色名", "delta": 整数（-5~+10）}],
    "jealousy": [{"name": "攻略角色名", "delta": 整数（-3~+12）}]
  },
  "choices": ["【系统建议】...", "【保持沉默】...", "【介入】...", "选项D"]
}

注意：
- 选项必须从「系统」视角给出，例如“【系统建议】主动邀请他训练”、“【保持沉默】让主角自己决定”。
- 剧情中主角与攻略角色可以暧昧、互动，但保持BL风格。
- 数值变化需合理：选择靠近攻略角色会增加好感，选择回避可能降低。`;

  const userPrompt = `【当前剧情摘要】${(gameState.storyHistory || '').slice(-400)}
【上一轮玩家选择】${gameState.lastChoice || '无'}
【主角状态】健康${gameState.protagonist.health}，心情${gameState.protagonist.mood}，信任${gameState.protagonist.trust}，友情${gameState.protagonist.friendship}
【攻略角色状态】${gameState.loveInterests.map(l => `${l.name}: 好感${l.favorability}, 妒忌${l.jealousy}`).join('；')}
【副本特殊进度】${gameState.specialName || '进度'}: ${gameState.specialProgress}
请生成下一段剧情和数值变化。`;

  const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.85,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`DeepSeek API error: ${response.status}`);
  }
  const data = await response.json();
  const content = data.choices[0].message.content;
  return JSON.parse(content);
}

// 模拟响应（当 API Key 缺失或调用失败时使用）
function getMockResponse(state) {
  const { protagonist, loveInterests, world } = state;
  const delta = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const favorChanges = loveInterests.map(li => ({ name: li.name, delta: delta(-2, 5) }));
  const jealChanges = loveInterests.map(li => ({ name: li.name, delta: delta(-1, 3) }));
  return {
    story_text: `【模拟剧情】在${world}中，${protagonist.name}与${loveInterests[0]?.name || '攻略角色'}相遇。空气中弥漫着微妙的氛围。`,
    stats_update: {
      health: delta(-2, 2),
      mood: delta(-3, 5),
      trust: delta(-1, 3),
      friendship: delta(-1, 2),
      special: delta(0, 5),
      favorability: favorChanges,
      jealousy: jealChanges,
    },
    choices: [
      '【系统建议】主动靠近他',
      '【保持沉默】观察他的反应',
      '【介入】制造两人独处的机会',
      '【建议】暂时撤退，从长计议'
    ],
  };
}
