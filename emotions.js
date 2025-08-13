/**
 * 猫咪音频特征情绪分类规则引擎
 * =====================================
 * 
 * 📋 系统功能概述：
 * 本模块实现了基于音频特征的猫咪情绪分类系统，是多模态猫咪行为识别系统中"声音特征模型层"的核心组件。
 * 
 * 🎯 核心功能：
 * 1. 将5个音频数值特征映射到21种具体的猫咪情绪
 * 2. 基于阈值规则引擎进行实时情绪分类
 * 3. 返回包含情绪类别、置信度和表情符号的结构化结果
 * 
 * 📊 输入音频特征（来自features.js）：
 * - zeroCrossingRate: 过零率 - 反映声音的频率变化
 * - spectralCentroid: 频谱质心 - 反映声音的"亮度"
 * - spectralRolloff: 频谱滚降 - 反映高频能量分布
 * - energy: 能量 - 反映声音的强度
 * - rms: 均方根 - 反映声音的有效值
 * 
 * 🗂️ 情绪分类体系（21种情绪，3大类别）：
 * 
 * 1. FRIENDLY 友善类（5种）- 低强度、温和声音：
 *    - comfortable 😌: 舒适放松
 *    - satisfy 😊: 满足
 *    - call 😺: 友善呼叫
 *    - flighty 🥰: 亲昵
 *    - yummy 😋: 享受美食
 * 
 * 2. ATTENTION 求关注类（9种）- 中等强度、寻求行为：
 *    - hello 👋: 打招呼
 *    - for_food 🍽️: 要求食物
 *    - ask_for_play 🧶: 邀请玩耍
 *    - ask_for_hunting 🐁: 邀请狩猎
 *    - curious 🤔: 好奇
 *    - find_mom 🐈: 寻找妈妈/求助
 *    - anxious 😰: 焦虑害怕
 *    - discomfort 😣: 不适困扰
 *    - courtship 💕: 求偶
 * 
 * 3. WARNING 警告类（7种）- 高强度、攻击性/防御性：
 *    - for_fight 🥊: 强烈警告/准备战斗
 *    - dieaway 💀: 立即退开
 *    - goout 👉: 滚出去
 *    - warning ⚠️: 警告驱逐
 *    - alert 🚨: 敌意警戒
 *    - goaway 🚫: 走开
 *    - unhappy 😒: 不高兴
 * 
 * 🔧 规则引擎设计原理：
 * 1. 特征标准化：将原始特征值缩放到0-1范围，确保分类一致性
 * 2. 阈值规则：每种情绪定义特定的音频特征阈值组合
 * 3. 置信度评估：只返回置信度>50%的分类结果
 * 4. 最佳匹配：选择置信度最高的情绪作为最终结果
 * 
 * 🔗 集成说明：
 * - 与mewt.js的上下文管理系统集成，实现有限状态机状态转移
 * - 与play-deep.html的MediaPipe分类结果结合，形成完整的多模态识别
 * - 支持LRU缓存和频次控制的实时决策系统
 * 
 * 📦 主要导出函数：
 * - classifyEmotion(): 完整情绪分类，返回详细结果
 * - classifyEmotionCategory(): 简化分类，只返回类别ID
 * - getEmotionById(): 根据ID获取情绪对象
 * - getCategoryById(): 根据ID获取类别对象
 * 
 * 🎪 使用示例：
 * ```javascript
 * const audioFeatures = {
 *   zeroCrossingRate: 0.05,
 *   spectralCentroid: 2000,
 *   spectralRolloff: 0.4,
 *   energy: 0.0005,
 *   rms: 0.5
 * };
 * 
 * const result = classifyEmotion(audioFeatures);
 * if (result) {
 *   console.log(`检测到情绪: ${result.emotion.icon} ${result.emotion.title}`);
 *   console.log(`置信度: ${Math.round(result.confidence * 100)}%`);
 * }
 * ```
 */

export const emotionCategories = [
  {
    id: 'friendly',
    title: 'Friendly',
    description: 'Cat feels pleased, content, or friendly',
  },
  {
    id: 'attention',
    title: 'Attention',
    description: 'Cat wants to get your attention',
  },
  {
    id: 'warning',
    title: 'Warning',
    description: 'Cat feels anxious, angry, or wants to warn',
  },
];

export const emotions = [
  {
    id: 'call',
    icon: '😺',
    title: 'Friendly Call',
    description: 'Friendly calling to other cats',
    categoryId: 'friendly',
  },
  {
    id: 'comfortable',
    icon: '😌',
    title: 'Comfortable',
    description: 'Your cat feels comfortable and relaxed',
    categoryId: 'friendly',
  },
  {
    id: 'flighty',
    icon: '🥰',
    title: 'Affectionate',
    description: 'Affectionately calling to other cats',
    categoryId: 'friendly',
  },
  {
    id: 'satisfy',
    icon: '😊',
    title: 'Satisfied',
    description: 'Feeling satisfied',
    categoryId: 'friendly',
  },
  {
    id: 'yummy',
    icon: '😋',
    title: 'Delicious',
    description: 'Enjoying tasty food',
    categoryId: 'friendly',
  },
  {
    id: 'hello',
    icon: '👋',
    title: 'Greeting',
    description: 'Friendly greeting and being affectionate',
    categoryId: 'attention',
  },
  {
    id: 'for_food',
    icon: '🍽️',
    title: 'Food Request',
    description: 'Greeting and requesting food',
    categoryId: 'attention',
  },
  {
    id: 'ask_for_play',
    icon: '🧶',
    title: 'Play Invitation',
    description: 'Inviting to play',
    categoryId: 'attention',
  },
  {
    id: 'ask_for_hunting',
    icon: '🐁',
    title: 'Hunt Invitation',
    description: 'Excited, wanting to hunt',
    categoryId: 'attention',
  },
  {
    id: 'discomfort',
    icon: '😣',
    title: 'Distressed',
    description: 'Feeling upset, uncomfortable, leave me alone',
    categoryId: 'attention',
  },
  {
    id: 'find_mom',
    icon: '🐈',
    title: 'Help/Finding Mom',
    description: 'Seeking help or looking for mom',
    categoryId: 'attention',
  },
  {
    id: 'anxious',
    icon: '😰',
    title: 'Anxious/Scared',
    description: 'Feeling anxious or scared',
    categoryId: 'attention',
  },
  {
    id: 'courtship',
    icon: '💕',
    title: 'Mating Call',
    description: 'Looking for a mate',
    categoryId: 'attention',
  },
  {
    id: 'curious',
    icon: '🤔',
    title: 'Curious',
    description: 'Being perfunctory or curious',
    categoryId: 'attention',
  },
  {
    id: 'goaway',
    icon: '🚫',
    title: 'Go Away!',
    description: 'Go away!',
    categoryId: 'warning',
  },
  {
    id: 'goout',
    icon: '👉',
    title: 'Get Out!',
    description: 'Get out!',
    categoryId: 'warning',
  },
  {
    id: 'dieaway',
    icon: '💀',
    title: 'Back Off!',
    description: 'Back off immediately!',
    categoryId: 'warning',
  },
  {
    id: 'warning',
    icon: '⚠️',
    title: 'Warning',
    description: 'Warning and expulsion',
    categoryId: 'warning',
  },
  {
    id: 'unhappy',
    icon: '😒',
    title: 'Unhappy',
    description: 'Leave me alone, dissatisfied',
    categoryId: 'warning',
  },
  {
    id: 'alert',
    icon: '🚨',
    title: 'Alert',
    description: 'Hostile and vigilant',
    categoryId: 'warning',
  },
  {
    id: 'for_fight',
    icon: '🥊',
    title: 'Strong Warning',
    description: 'Strong warning, preparing to fight',
    categoryId: 'warning',
  },
];

// Audio feature classification rule engine
export function classifyEmotion(features) {
  const { zeroCrossingRate, spectralCentroid, spectralRolloff, energy, rms } = features;
  
  // Helper function to get emotion by id
  const getEmotion = (id) => emotions.find(e => e.id === id);
  const getCategory = (id) => emotionCategories.find(c => c.id === id);

  // Normalize features for better classification (0-1 range)
  const normalizedZCR = Math.min(zeroCrossingRate * 10, 1); // Scale ZCR
  const normalizedCentroid = Math.min(spectralCentroid / 5000, 1); // Scale spectral centroid
  const normalizedRolloff = Math.min(spectralRolloff * 2, 1); // Scale rolloff
  const normalizedEnergy = Math.min(energy * 1000000, 1); // Scale energy
  const normalizedRMS = Math.min(rms * 1000, 1); // Scale RMS

  let bestMatch = null;

  // Classification rules for each emotion
  const rules = [
    // FRIENDLY CATEGORY - Low intensity, gentle sounds
    {
      emotionId: 'comfortable',
      rule: () => {
        if (normalizedEnergy < 0.2 && normalizedRMS < 0.3 && normalizedZCR < 0.3) {
          return 0.9 - normalizedEnergy; // Very low energy = very comfortable
        }
        return 0;
      }
    },
    {
      emotionId: 'satisfy',
      rule: () => {
        if (normalizedEnergy > 0.1 && normalizedEnergy < 0.4 && 
            normalizedRMS > 0.2 && normalizedRMS < 0.5 &&
            normalizedZCR < 0.4) {
          return 0.8;
        }
        return 0;
      }
    },
    {
      emotionId: 'call',
      rule: () => {
        if (normalizedEnergy > 0.2 && normalizedEnergy < 0.6 && 
            normalizedCentroid > 0.3 && normalizedCentroid < 0.7 &&
            normalizedZCR > 0.2 && normalizedZCR < 0.6) {
          return 0.75;
        }
        return 0;
      }
    },
    {
      emotionId: 'flighty',
      rule: () => {
        if (normalizedEnergy > 0.3 && normalizedEnergy < 0.6 && 
            normalizedRMS > 0.3 && normalizedRMS < 0.6 &&
            normalizedCentroid > 0.4) {
          return 0.7;
        }
        return 0;
      }
    },
    {
      emotionId: 'yummy',
      rule: () => {
        if (normalizedEnergy > 0.2 && normalizedEnergy < 0.5 && 
            normalizedZCR > 0.3 && normalizedZCR < 0.6 &&
            normalizedRolloff > 0.3) {
          return 0.75;
        }
        return 0;
      }
    },

    // ATTENTION CATEGORY - Varied intensity, seeking behavior
    {
      emotionId: 'hello',
      rule: () => {
        if (normalizedEnergy > 0.3 && normalizedEnergy < 0.7 && 
            normalizedCentroid > 0.4 && normalizedCentroid < 0.8 &&
            normalizedRMS > 0.3) {
          return 0.8;
        }
        return 0;
      }
    },
    {
      emotionId: 'for_food',
      rule: () => {
        if (normalizedEnergy > 0.4 && normalizedEnergy < 0.8 && 
            normalizedRMS > 0.4 && normalizedRMS < 0.8 &&
            normalizedZCR > 0.3 && normalizedZCR < 0.7) {
          return 0.85;
        }
        return 0;
      }
    },
    {
      emotionId: 'ask_for_play',
      rule: () => {
        if (normalizedEnergy > 0.5 && normalizedEnergy < 0.8 && 
            normalizedCentroid > 0.5 && normalizedZCR > 0.4 &&
            normalizedRMS > 0.4) {
          return 0.8;
        }
        return 0;
      }
    },
    {
      emotionId: 'ask_for_hunting',
      rule: () => {
        if (normalizedEnergy > 0.6 && normalizedCentroid > 0.6 && 
            normalizedZCR > 0.5 && normalizedRMS > 0.5) {
          return 0.85;
        }
        return 0;
      }
    },
    {
      emotionId: 'curious',
      rule: () => {
        if (normalizedEnergy > 0.2 && normalizedEnergy < 0.6 && 
            normalizedCentroid > 0.3 && normalizedCentroid < 0.7 &&
            normalizedZCR > 0.3 && normalizedZCR < 0.7) {
          return 0.6;
        }
        return 0;
      }
    },
    {
      emotionId: 'find_mom',
      rule: () => {
        if (normalizedEnergy > 0.7 && normalizedRMS > 0.6 && 
            normalizedCentroid > 0.6 && normalizedZCR > 0.6) {
          return 0.9;
        }
        return 0;
      }
    },
    {
      emotionId: 'anxious',
      rule: () => {
        if (normalizedCentroid > 0.7 && normalizedZCR > 0.6 && 
            normalizedEnergy > 0.4 && normalizedRolloff > 0.6) {
          return 0.85;
        }
        return 0;
      }
    },
    {
      emotionId: 'discomfort',
      rule: () => {
        if (normalizedEnergy > 0.3 && normalizedEnergy < 0.7 && 
            normalizedZCR > 0.5 && normalizedCentroid > 0.5 &&
            normalizedRMS > 0.3) {
          return 0.7;
        }
        return 0;
      }
    },
    {
      emotionId: 'courtship',
      rule: () => {
        if (normalizedEnergy > 0.5 && normalizedCentroid > 0.4 && 
            normalizedCentroid < 0.8 && normalizedRolloff > 0.4 &&
            normalizedRMS > 0.4) {
          return 0.75;
        }
        return 0;
      }
    },

    // WARNING CATEGORY - High intensity, aggressive/defensive
    {
      emotionId: 'for_fight',
      rule: () => {
        if (normalizedEnergy > 0.8 && normalizedCentroid > 0.8 && 
            normalizedZCR > 0.8 && normalizedRMS > 0.8 &&
            normalizedRolloff > 0.7) {
          return 0.95;
        }
        return 0;
      }
    },
    {
      emotionId: 'dieaway',
      rule: () => {
        if (normalizedEnergy > 0.85 && normalizedCentroid > 0.7 && 
            normalizedZCR > 0.7 && normalizedRMS > 0.7) {
          return 0.9;
        }
        return 0;
      }
    },
    {
      emotionId: 'goout',
      rule: () => {
        if (normalizedEnergy > 0.75 && normalizedCentroid > 0.6 && 
            normalizedZCR > 0.6 && normalizedRMS > 0.6) {
          return 0.85;
        }
        return 0;
      }
    },
    {
      emotionId: 'warning',
      rule: () => {
        if (normalizedCentroid > 0.7 && normalizedZCR > 0.7 && 
            normalizedEnergy > 0.6 && normalizedRMS > 0.5) {
          return 0.8;
        }
        return 0;
      }
    },
    {
      emotionId: 'alert',
      rule: () => {
        if (normalizedCentroid > 0.8 && normalizedZCR > 0.6 && 
            normalizedEnergy > 0.5 && normalizedRolloff > 0.7) {
          return 0.8;
        }
        return 0;
      }
    },
    {
      emotionId: 'goaway',
      rule: () => {
        if (normalizedEnergy > 0.6 && normalizedCentroid > 0.6 && 
            normalizedZCR > 0.5 && normalizedRMS > 0.5) {
          return 0.75;
        }
        return 0;
      }
    },
    {
      emotionId: 'unhappy',
      rule: () => {
        if (normalizedEnergy > 0.4 && normalizedEnergy < 0.8 && 
            normalizedCentroid > 0.5 && normalizedZCR > 0.4 &&
            normalizedRMS > 0.4) {
          return 0.7;
        }
        return 0;
      }
    }
  ];

  // Find the best matching emotion
  for (const { emotionId, rule } of rules) {
    const confidence = rule();
    if (confidence > 0 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = { emotionId, confidence };
    }
  }

  // Return classification result
  if (bestMatch && bestMatch.confidence > 0.5) {
    const emotion = getEmotion(bestMatch.emotionId);
    const category = emotion ? getCategory(emotion.categoryId) : null;
    
    if (emotion && category) {
      return {
        emotionId: bestMatch.emotionId,
        emotion,
        confidence: bestMatch.confidence,
        category
      };
    }
  }

  return null; // No confident classification found
}

// Helper function to get emotion category only (simplified classification)
export function classifyEmotionCategory(features) {
  const result = classifyEmotion(features);
  return result ? result.category.id : null;
}

// Get emotion by ID helper function
export function getEmotionById(id) {
  return emotions.find(e => e.id === id);
}

// Get category by ID helper function
export function getCategoryById(id) {
  return emotionCategories.find(c => c.id === id);
}
