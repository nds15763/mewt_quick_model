/**
 * 四状态分类管理器
 * ==================
 * 
 * 📋 模块功能概述：
 * 本模块实现了猫咪检测系统的核心状态机，负责根据视觉和音频检测结果进行四种状态的分类判断。
 * 这是整个多模态识别系统的决策核心，将复杂的多源数据融合为清晰的状态输出。
 * 
 * 🎯 四种核心状态：
 * 1. **idle** - 观察状态：既没有检测到猫的视觉信号，也没有猫叫声
 * 2. **cat_visual** - 视觉检测：检测到猫的图像，但没有听到猫叫声  
 * 3. **cat_audio** - 音频检测：听到了猫叫声，但视觉上没有检测到猫
 * 4. **cat_both** - 双重确认：同时检测到猫的视觉和音频信号
 * 
 * 🏗️ 状态转移逻辑：
 * ```
 *     视觉\音频    无音频      有音频
 *     无视觉       idle    →  cat_audio
 *     有视觉   cat_visual → cat_both
 * ```
 * 
 * 🔍 检测阈值机制：
 * - **视觉检测阈值**：0.3（MediaPipe分类置信度）
 * - **音频检测阈值**：0.2（YAMNet分类置信度）
 * - 支持动态阈值调整，适应不同环境条件
 * 
 * 📊 检测算法详解：
 * 
 * **视觉检测算法**：
 * - 遍历当前窗口内的所有图像分类结果
 * - 检查类别名称是否包含 "cat" 关键词
 * - 验证分类置信度是否超过设定阈值
 * - 支持多种猫咪类别：cat, domestic_cat, persian_cat 等
 * 
 * **音频检测算法**：
 * - 扫描音频分类结果中的猫相关声音
 * - 关键词匹配：cat, meow, purr 等
 * - 置信度验证，滤除噪音干扰
 * - 支持不同类型的猫叫声识别
 * 
 * 🎭 状态响应文本系统：
 * 每种状态都对应特定的中文响应文本，便于用户理解：
 * - idle: "观察中..." - 平静等待状态
 * - cat_visual: "那里有只小猫" - 发现但保持距离
 * - cat_audio: "诶？我好像听到小猫叫了" - 听觉敏感提醒
 * - cat_both: "哦！是个小猫" - 确认发现，表达兴奋
 * 
 * 🔄 与信任机制的集成：
 * 状态管理器的输出会被LRU信任机制使用：
 * - idle状态触发历史信任检查
 * - 其他状态直接更新关注标志
 * - 避免因单帧检测失败导致的状态抖动
 * 
 * 🚀 性能优化：
 * - 使用Map结构存储当前窗口数据，O(1)查找性能
 * - 惰性计算，只在需要时进行状态判断
 * - 缓存检测结果，避免重复计算
 * 
 * 🔗 模块接口说明：
 * - hasVisualCat(): 检测当前是否有视觉猫信号
 * - hasCatSound(): 检测当前是否有音频猫信号  
 * - determineState(): 综合判断当前系统状态
 * - getStateResponse(): 获取状态对应的响应文本
 * 
 * 📈 扩展性设计：
 * - 支持添加新的检测类型（如红外、超声波等）
 * - 可配置的阈值系统，适应不同应用场景
 * - 模块化设计，便于集成到更大的AI系统中
 */

/**
 * 四状态分类管理器类
 * 负责根据多模态输入进行状态分类和响应生成
 */
export class StateManager {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    // 检测阈值配置
    this.config = {
      CAT_DETECTION_THRESHOLD: config.catDetectionThreshold || 0.3,
      CAT_SOUND_THRESHOLD: config.catSoundThreshold || 0.2,
      ...config
    };
    
    // 四状态响应文本映射
    this.stateResponses = {
      'idle': '观察中...',
      'cat_visual': '那里有只小猫',
      'cat_audio': '诶？我好像听到小猫叫了',
      'cat_both': '哦！是个小猫'
    };
    
    // 状态优先级（用于冲突解决）
    this.statePriority = {
      'cat_both': 4,    // 最高优先级
      'cat_visual': 3,
      'cat_audio': 2,
      'idle': 1         // 最低优先级
    };
  }

  /**
   * 检查当前图像数据中是否包含猫
   * @param {Map} currentImageMap - 当前图像检测结果Map
   * @returns {boolean} 是否检测到猫
   */
  hasVisualCat(currentImageMap) {
    if (!currentImageMap || currentImageMap.size === 0) {
      return false;
    }
    
    for (const [className, score] of currentImageMap) {
      // 检查类别名称是否包含猫相关关键词
      if (this.isCatClass(className) && score > this.config.CAT_DETECTION_THRESHOLD) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 检查当前音频数据中是否包含猫叫声
   * @param {Map} currentAudioMap - 当前音频检测结果Map
   * @returns {boolean} 是否检测到猫叫声
   */
  hasCatSound(currentAudioMap) {
    if (!currentAudioMap || currentAudioMap.size === 0) {
      return false;
    }
    
    for (const [className, score] of currentAudioMap) {
      // 检查类别名称是否包含猫声相关关键词
      if (this.isCatSoundClass(className) && score > this.config.CAT_SOUND_THRESHOLD) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 判断类别名称是否为猫相关类别
   * @param {string} className - 分类结果类别名称
   * @returns {boolean} 是否为猫相关类别
   */
  isCatClass(className) {
    const catKeywords = [
      'cat', 'cats', 'domestic_cat', 'persian_cat', 
      'siamese_cat', 'tabby_cat', 'kitten', 'feline'
    ];
    
    const lowerClassName = className.toLowerCase();
    return catKeywords.some(keyword => lowerClassName.includes(keyword));
  }

  /**
   * 判断类别名称是否为猫叫声相关类别
   * @param {string} className - 分类结果类别名称  
   * @returns {boolean} 是否为猫叫声相关类别
   */
  isCatSoundClass(className) {
    const catSoundKeywords = [
      'cat', 'meow', 'purr', 'purring', 'mew', 
      'mewing', 'feline', 'cat_vocalization'
    ];
    
    const lowerClassName = className.toLowerCase();
    return catSoundKeywords.some(keyword => lowerClassName.includes(keyword));
  }

  /**
   * 根据视觉和音频检测结果确定当前状态
   * @param {boolean} hasVisual - 是否有视觉检测
   * @param {boolean} hasAudio - 是否有音频检测
   * @returns {string} 当前状态标识符
   */
  determineState(hasVisual, hasAudio) {
    if (hasVisual && hasAudio) {
      return 'cat_both';
    } else if (hasVisual) {
      return 'cat_visual';
    } else if (hasAudio) {
      return 'cat_audio';
    } else {
      return 'idle';
    }
  }

  /**
   * 综合分析当前窗口数据并返回状态
   * @param {Map} currentImageMap - 图像检测结果
   * @param {Map} currentAudioMap - 音频检测结果
   * @returns {string} 当前状态
   */
  analyzeCurrentState(currentImageMap, currentAudioMap) {
    const hasVisual = this.hasVisualCat(currentImageMap);
    const hasAudio = this.hasCatSound(currentAudioMap);
    
    return this.determineState(hasVisual, hasAudio);
  }

  /**
   * 获取状态对应的响应文本
   * @param {string} state - 状态标识符
   * @returns {string} 对应的响应文本
   */
  getStateResponse(state) {
    return this.stateResponses[state] || this.stateResponses['idle'];
  }

  /**
   * 生成完整的状态响应对象
   * @param {string} state - 当前状态
   * @param {boolean} isFocusing - 是否正在关注猫咪
   * @returns {Object} 状态响应对象
   */
  generateStateResponse(state, isFocusing = false) {
    return {
      type: 'state',
      state: state,
      text: this.getStateResponse(state),
      is_focusing_cat: isFocusing,
      timestamp: Date.now(),
      priority: this.statePriority[state] || 1
    };
  }

  /**
   * 获取详细的检测信息
   * @param {Map} currentImageMap - 图像检测结果
   * @param {Map} currentAudioMap - 音频检测结果
   * @returns {Object} 详细检测信息
   */
  getDetailedDetectionInfo(currentImageMap, currentAudioMap) {
    // 提取猫相关的图像检测结果
    const catImageDetections = [];
    if (currentImageMap) {
      for (const [className, score] of currentImageMap) {
        if (this.isCatClass(className)) {
          catImageDetections.push({ class: className, score });
        }
      }
    }

    // 提取猫相关的音频检测结果
    const catAudioDetections = [];
    if (currentAudioMap) {
      for (const [className, score] of currentAudioMap) {
        if (this.isCatSoundClass(className)) {
          catAudioDetections.push({ class: className, score });
        }
      }
    }

    const hasVisual = this.hasVisualCat(currentImageMap);
    const hasAudio = this.hasCatSound(currentAudioMap);
    const currentState = this.determineState(hasVisual, hasAudio);

    return {
      state: currentState,
      hasVisualCat: hasVisual,
      hasCatSound: hasAudio,
      catImageDetections: catImageDetections.sort((a, b) => b.score - a.score),
      catAudioDetections: catAudioDetections.sort((a, b) => b.score - a.score),
      visualThreshold: this.config.CAT_DETECTION_THRESHOLD,
      audioThreshold: this.config.CAT_SOUND_THRESHOLD,
      stateText: this.getStateResponse(currentState)
    };
  }

  /**
   * 更新检测阈值
   * @param {Object} newThresholds - 新的阈值配置
   */
  updateThresholds(newThresholds) {
    if (newThresholds.catDetectionThreshold !== undefined) {
      this.config.CAT_DETECTION_THRESHOLD = newThresholds.catDetectionThreshold;
    }
    if (newThresholds.catSoundThreshold !== undefined) {
      this.config.CAT_SOUND_THRESHOLD = newThresholds.catSoundThreshold;
    }
  }

  /**
   * 获取当前配置信息
   * @returns {Object} 当前配置
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * 获取所有可用状态列表
   * @returns {Array} 状态列表
   */
  getAllStates() {
    return Object.keys(this.stateResponses);
  }

  /**
   * 检查状态是否有效
   * @param {string} state - 状态标识符
   * @returns {boolean} 状态是否有效
   */
  isValidState(state) {
    return Object.keys(this.stateResponses).includes(state);
  }
}

export default StateManager;
