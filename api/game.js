// api/game.js - 完整游戏逻辑后端
// 支持 action: init, step, shop, buy
// 依赖环境变量 DEEPSEEK_API_KEY

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
    const body = req.body;
    const action = body.action;

    // 初始化
    if (action === 'init') {
      const initState = await initGame(body);
      return res.status(200).json(initState);
    }
    // 推进剧情
    else if (action === 'step') {
      const newState = await stepGame(body);
      return res.status(200).json(newState);
    }
    // 商店列表
    else if (action === 'shop') {
      const shopItems = getShopItems();
      return res.status(200).json({ shopItems });
    }
    // 购买道具
    else if (action === 'buy') {
      const newState = await buyItem(body);
      return res.status(200).json(newState);
    }
    else {
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('API Error:', err);
    res.status(500).json({ error: '服务器内部错误: ' + err.message });
  }
};

// ---------- 初始化 ----------
async function initGame(data) {
  const { protagonist: proto, loveInterests: loveList, world } = data;

  // 生成主角完整信息（包括性格、喜好雷区等）
  const protagonist = generateCharacter(proto, true);

  // 生成攻略角色完整信息
  const loveInterests = loveList.map(li => generateCharacter(li, false));

  // 副本特殊初始值
  let specialProgress = 0;
  let specialValueName = '';
  if (world.includes('哨向导')) specialValueName = '武力值';
  else if (world.includes('电竞')) specialValueName = '游戏实力';
  else if (world.includes('末世')) specialValueName = '基建进度';
  else if (world.includes('换乘')) specialValueName = '拍摄进度';
  else if (world.includes('规则怪谈')) specialValueName = '武力值';

  // 初始剧情
  const initStory = `「${world}」\n\n你作为系统，将主角${protagonist.name}传送至副本世界。\n周围的环境逐渐清晰……${getWorldIntro(world)}`;

  return {
    protagonist,
    loveInterests,
    world,
    storyText: initStory,
    choices: generateInitialChoices(world),
    missionHint: getMissionHint(world),
    specialProgress,
    specialValueName,
    gameOver: false,
    gameOverReason: '',
    storyHistory: initStory,
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
  const { protagonist, loveInterests, world, storyHistory, lastChoice, specialProgress } = newState;

  // 1. 调用 DeepSeek 生成剧情和数值建议
  const aiResponse = await callDeepSeek(newState);
  const { story_text, stats_update, choices } = aiResponse;

  // 2. 应用数值变化
  if (stats_update) {
    if (stats_update.protagonist_health) protagonist.health = clamp(protagonist.health + stats_update.protagonist_health, 0, 100);
    if (stats_update.protagonist_mood) protagonist.mood = clamp(protagonist.mood + stats_update.protagonist_mood, 0, 100);
    if (stats_update.system_trust) protagonist.trust = clamp(protagonist.trust + stats_update.system_trust, 0, 100);
    if (stats_update.friendship) protagonist.friendship = clamp(protagonist.friendship + stats_update.friendship, 0, 100);
    if (stats_update.special_progress) newState.specialProgress = clamp(newState.specialProgress + stats_update.special_progress, 0, 100);

    // 好感度/妒忌值变化
    if (stats_update.favorability_changes) {
      stats_update.favorability_changes.forEach(change => {
        const target = loveInterests.find(li => li.name === change.name);
        if (target) {
          target.favorability = clamp(target.favorability + change.delta, 0, 100);
        }
      });
    }
    if (stats_update.jealousy_changes) {
      stats_update.jealousy_changes.forEach(change => {
        const target = loveInterests.find(li => li.name === change.name);
        if (target) {
          target.jealousy = clamp(target.jealousy + change.delta, 0, 100);
        }
      });
    }
  }

  // 3. 副本任务触发检查（好感度70触发倒计时）
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

  // 4. 副本任务完成判定
  if (world.includes('换乘') && newState.specialProgress >= 21) {
    newState.gameOver = true;
    newState.gameOverReason = '节目录制完成，你选择了新的开始。副本通关！';
  }
  if (world.includes('末世') && newState.specialProgress >= 100) {
    newState.gameOver = true;
    newState.gameOverReason = '基地建设完成，人类找到了希望。副本通关！';
  }
  if (world.includes('哨向导') && newState.finalBattleTriggered && newState.finalBattleCountdown <= 0) {
    // 最终战役结算
    if (protagonist.health >= 60 && (protagonist.specialValue || 80) >= 90) {
      newState.gameOver = true;
      newState.gameOverReason = '战役胜利！你成为了英雄。副本通关！';
    } else {
      newState.gameOver = true;
      newState.gameOverReason = '你在最终战役中牺牲了... BE';
    }
  }
  if (world.includes('电竞') && newState.worldsTriggered && newState.worldsCountdown <= 0) {
    if (protagonist.health >= 60 && (protagonist.specialValue || 80) >= 90) {
      newState.gameOver = true;
      newState.gameOverReason = '你们捧起了召唤师奖杯！副本通关！';
    } else {
      newState.gameOver = true;
      newState.gameOverReason = '错失了冠军... BE';
    }
  }

  // 5. 健康值过低结束
  if (protagonist.health <= 5) {
    newState.gameOver = true;
    newState.gameOverReason = '主角健康值耗尽，未能撑到最后。';
  }

  newState.storyText = story_text;
  newState.choices = choices;
  // 更新剧情历史
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
  // 添加购买提示剧情（可选）
  newState.storyText = `【道具使用】${costCharacter}消耗了${costValue}好感度，换来了「${getShopItems().find(i=>i.id===itemId)?.name}」。\n\n` + (newState.storyText || '');
  return newState;
}

// ---------- 辅助函数 ----------
function clamp(val, min, max) {
  return Math.min(max, Math.max(min, val));
}

function generateCharacter(base, isProtagonist) {
  // 根据生日/MBTI简单生成性格关键词、喜好、雷区（实际可以调用LLM或更细致规则）
  const mbtiMap = {
    INFP: { likes: ['真诚', '艺术', '安静陪伴'], dislikes: ['虚伪', '暴力', '强迫'] },
    ENTP: { likes: ['辩论', '新奇', '挑战'], dislikes: ['无聊', '守旧', '被束缚'] },
    ENFJ: { likes: ['帮助他人', '社交', '肯定'], dislikes: ['冷漠', '不公', '背叛'] },
    ISTP: { likes: ['动手', '独立', '刺激'], dislikes: ['啰嗦', '情绪化', '规则'] },
    INTJ: { likes: ['战略', '深度', '效率'], dislikes: ['肤浅', '打扰', '混乱'] },
    ESFJ: { likes: ['照顾', '和谐', '传统'], dislikes: ['冲突', '冷漠', '变化'] },
    ISFP: { likes: ['美', '自由', '感官体验'], dislikes: ['控制', '压力', '评判'] },
    ENTJ: { likes: ['领导', '成就', '挑战'], dislikes: ['无能', '拖延', '软弱'] },
    ENFP: { likes: ['探索', '可能性', '热情'], dislikes: ['例行公事', '批评', '束缚'] },
  };
  const mbti = base.mbti || 'INFP';
  const profile = mbtiMap[mbti] || { likes: ['温柔', '理解'], dislikes: ['冷漠', '背叛'] };
  const name = base.name;
  const group = base.group || '';
  const birthday = base.birthday || '2000-01-01';
  const char = {
    name,
    group,
    birthday,
    mbti,
    health: 100,
    mood: 70,
    trust: isProtagonist ? 25 : 0,
    friendship: isProtagonist ? 15 : 0,
    favorability: isProtagonist ? undefined : 20,
    jealousy: isProtagonist ? undefined : 0,
    likes: profile.likes.join('、'),
    dislikes: profile.dislikes.join('、'),
    specialValue: isProtagonist ? (Math.floor(Math.random() * 20) + 80) : undefined,
  };
  if (!isProtagonist) {
    delete char.health;
    delete char.mood;
    delete char.trust;
    delete char.friendship;
  }
  return char;
}

function getWorldIntro(world) {
  if (world.includes('哨向导')) return '你身处一座巨大的星际塔，周围是银白色的金属墙壁，隐约能听见白噪音流淌。';
  if (world.includes('电竞')) return '这里是全球总决赛的舞台，灯光璀璨，观众欢呼。你坐在选手席上，屏幕闪烁着选英雄界面。';
  if (world.includes('末世')) return '街道一片混乱，远处传来尖叫声和爆炸声。丧尸病毒刚刚爆发，你必须带领幸存者建立安全区。';
  if (world.includes('换乘')) return '你提着行李走进一栋海边别墅，门上贴着“心动公寓”。这里即将开始21天的恋爱同居。';
  if (world.includes('规则怪谈')) return '你站在静默林边缘，面前竖着一块木牌，上面写着十条规则。';
  return '副本世界加载完成。';
}

function getMissionHint(world) {
  if (world.includes('哨向导')) return '最终战役尚未触发';
  if (world.includes('电竞')) return '全球总决赛尚未触发';
  if (world.includes('末世')) return '建设安全基地 0%';
  if (world.includes('换乘')) return '拍摄第1/21天';
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
    // 没有 key 时返回模拟数据（保证能测试）
    return getMockResponse(gameState);
  }

  const systemPrompt = buildSystemPrompt(gameState);
  const userPrompt = buildUserPrompt(gameState);

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
    console.error('DeepSeek API error:', response.status);
    return getMockResponse(gameState);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('JSON parse error:', e);
    return getMockResponse(gameState);
  }
}

function buildSystemPrompt(state) {
  const { protagonist, loveInterests, world } = state;
  const loveNames = loveInterests.map(li => li.name).join('、');
  return `你是一个BL恋爱游戏《上帝之手》的叙事引擎。当前副本：${world}。
主角：${protagonist.name}（${protagonist.mbti}），你作为系统辅助他。
攻略角色：${loveNames}。
你需要生成下一段剧情，并根据玩家选择更新以下数值：
- protagonist_health (-15~+15)
- protagonist_mood (-15~+15)
- system_trust (-5~+10)
- friendship (-5~+10)
- special_progress (0~+10，副本特殊进度)
- favorability_changes: 数组，每项 { name, delta } (-5~+10)
- jealousy_changes: 数组，每项 { name, delta } (-3~+12)

剧情要求：200~400字，BL风格，符合当前好感度阶段，包含对话和心理描写。
返回JSON格式：
{
  "story_text": "...",
  "stats_update": { ... },
  "choices": ["选项A", "选项B", "选项C", "选项D"]
}
注意：选项必须从玩家（系统）视角给出，如“【系统建议】...”、“【保持沉默】...”等。
`;
}

function buildUserPrompt(state) {
  const { protagonist, loveInterests, world, storyHistory, lastChoice, specialProgress } = state;
  const loveStatus = loveInterests.map(li => `${li.name}（好感${li.favorability}，妒忌${li.jealousy}）`).join('；');
  return `【当前剧情】
${storyHistory.slice(-500)}

【玩家上一轮选择】
${lastChoice || '无'}

【主角状态】
健康值：${protagonist.health}，心情值：${protagonist.mood}
信任值：${protagonist.trust}，友情值：${protagonist.friendship}
${world.includes('哨向导') ? `武力值：${protagonist.specialValue || 80}` : ''}
${world.includes('电竞') ? `游戏实力：${protagonist.specialValue || 80}` : ''}
${world.includes('末世') ? `基建进度：${specialProgress}%` : ''}
${world.includes('换乘') ? `拍摄进度：${specialProgress}/21天` : ''}

【攻略角色状态】
${loveStatus}

请根据以上信息生成下一段剧情、数值变化和4个新选项。`;
}

function getMockResponse(state) {
  const { protagonist, loveInterests, world } = state;
  const randomDelta = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const favorChanges = loveInterests.map(li => ({ name: li.name, delta: randomDelta(-2, 5) }));
  const jealChanges = loveInterests.map(li => ({ name: li.name, delta: randomDelta(-1, 3) }));
  return {
    story_text: `【模拟剧情】你在${world}中继续前行。${protagonist.name}感到周围的气息变化，似乎有人正注视着他。`,
    stats_update: {
      protagonist_health: randomDelta(-2, 2),
      protagonist_mood: randomDelta(-3, 5),
      system_trust: randomDelta(-1, 3),
      friendship: randomDelta(-1, 2),
      special_progress: randomDelta(0, 5),
      favorability_changes: favorChanges,
      jealousy_changes: jealChanges,
    },
    choices: [
      '【系统建议】主动靠近攻略角色',
      '【保持沉默】观察他们的互动',
      '【介入】尝试精神链接',
      '【建议】暂时撤退，从长计议'
    ],
  };
}
