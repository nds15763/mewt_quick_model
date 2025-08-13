/**
 * Mewt 上下文管理系统
 * ===================
 * 
 * 🎯 核心功能：
 * - 四状态分类判断 (idle/cat_visual/cat_audio/cat_both)
 * - LRU信任机制 (20容量图像缓存)
 * - 1秒时间窗口聚合
 * - 音频触发器和情绪分析
 * - 实时上下文维护
 */

// 导入情绪分类规则引擎
import { classifyEmotion } from './emotions.ts';

// 导入音频特征提取函数
import { 
  calculateZCR, 
  calculateSpectralCentroid, 
  calculateSpectralRolloff, 
  calculateEnergy, 
  calculateRMS 
} from './features.js';

class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key);
    // 更新访问顺序
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 如果超出最大尺寸，删除最久未使用的项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }

  // 获取最近的N个值
  recent(count) {
    const values = Array.from(this.cache.values());
    return values.slice(-count); // 返回最近的count个值
  }

  // 获取所有值
  getAllValues() {
    return Array.from(this.cache.values());
  }
}

/**
 * 上下文管理器类
 * 实现四状态分类、LRU信任机制、时间窗口聚合和音频触发器
 */
class ContextManager {
  constructor() {
    // 新的上下文结构
    this.context = {
      // 核心状态
      is_now_focusing_cat: false,
      
      // 时间管理
      last_mewt_time: 0,
      last_deepmewt_time: 0,
      last_deepmewt_answer_time: 0,
      
      // LRU信任管理 (容量20)
      image_lru: new LRUCache(20),
      
      // 1秒窗口聚合数据
      current: {
        current_image: new Map(), // 同类别去重
        current_audio: new Map(),
        current_audio_feature: null,
        emotion_classification: null
      }
    };
    
    // 配置参数
    this.config = {
      CAT_DETECTION_THRESHOLD: 0.3, // 猫检测阈值
      CAT_SOUND_THRESHOLD: 0.2,     // 猫叫声阈值
      WINDOW_INTERVAL: 1000,        // 1秒窗口间隔
      LRU_TRUST_COUNT: 10          // LRU信任检查数量
    };
    
    // 四状态响应文本
    this.stateResponses = {
      'idle': '观察中...',
      'cat_visual': '那里有只小猫',
      'cat_audio': '诶？我好像听到小猫叫了',
      'cat_both': '哦！是个小猫'
    };
    
    // 启动1秒窗口定时器
    this.windowTimer = setInterval(() => this.processWindow(), this.config.WINDOW_INTERVAL);
  }

  /**
   * 添加图像分类结果到当前窗口
   * @param {Array} classResults - 图像分类结果 [{class: string, score: number}]
   */
  addImageResult(classResults) {
    classResults.forEach(item => {
      // 同类别去重，保留最高分数
      if (!this.context.current.current_image.has(item.class) || 
          this.context.current.current_image.get(item.class) < item.score) {
        this.context.current.current_image.set(item.class, item.score);
      }
    });
  }

  /**
   * 添加音频分类结果到当前窗口
   * @param {Array} classResults - 音频分类结果 [{class: string, score: number}]
   * @param {Float32Array} audioBuffer - 原始音频数据 (用于特征提取)
   */
  addAudioResult(classResults, audioBuffer = null) {
    classResults.forEach(item => {
      // 同类别去重，保留最高分数
      if (!this.context.current.current_audio.has(item.class) || 
          this.context.current.current_audio.get(item.class) < item.score) {
        this.context.current.current_audio.set(item.class, item.score);
      }
    });
    
    // 音频触发器：检查是否有猫叫声
    if (this.hasCatSound() && audioBuffer) {
      return this.triggerAudioFeatureAnalysis(audioBuffer);
    }
    
    return null;
  }

  /**
   * 检查当前音频是否包含猫叫声
   */
  hasCatSound() {
    for (const [className, score] of this.context.current.current_audio) {
      if ((className.toLowerCase().includes('cat') || 
           className.toLowerCase().includes('meow')) && 
          score > this.config.CAT_SOUND_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查当前图像是否包含猫
   */
  hasVisualCat() {
    for (const [className, score] of this.context.current.current_image) {
      if (className.toLowerCase().includes('cat') && 
          score > this.config.CAT_DETECTION_THRESHOLD) {
        return true;
      }
    }
    return false;
  }

  /**
   * 音频触发器：立即进行音频特征分析和情绪分类
   * @param {Float32Array} audioBuffer - 音频数据
   * @returns {Object|null} 情绪分析结果
   */
  triggerAudioFeatureAnalysis(audioBuffer) {
    try {
      // 这里需要从features.js提取音频特征
      // 由于features.js在外部，我们假设已经计算好了特征
      // 实际使用时需要调用 calculateZCR, calculateSpectralCentroid 等函数
      
      // 模拟音频特征提取 (实际实现时需要集成features.js)
      const audioFeatures = this.extractAudioFeatures(audioBuffer);
      
      if (audioFeatures) {
        // 调用emotions.ts规则引擎
        const emotionResult = classifyEmotion(audioFeatures);
        
        // 保存到当前上下文
        this.context.current.current_audio_feature = audioFeatures;
        this.context.current.emotion_classification = emotionResult;
        
        // 立即生成情绪响应 (不等1秒窗口)
        return this.generateEmotionResponse(emotionResult);
      }
    } catch (error) {
      console.error('Audio feature analysis failed:', error);
    }
    
    return null;
  }

  /**
   * 提取音频特征 (集成features.js)
   * @param {Float32Array} audioBuffer
   * @returns {AudioFeatures|null}
   */
  extractAudioFeatures(audioBuffer) {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        return null;
      }

      // 使用features.js中的真实函数计算音频特征
      return {
        zeroCrossingRate: calculateZCR(audioBuffer),
        spectralCentroid: calculateSpectralCentroid(audioBuffer),
        spectralRolloff: calculateSpectralRolloff(audioBuffer),
        energy: calculateEnergy(audioBuffer),
        rms: calculateRMS(audioBuffer)
      };
    } catch (error) {
      console.error('Error extracting audio features:', error);
      return null;
    }
  }

  /**
   * 生成情绪响应
   * @param {Object} emotionResult - 情绪分析结果
   * @returns {Object}
   */
  generateEmotionResponse(emotionResult) {
    if (emotionResult) {
      return {
        type: 'emotion',
        emotion: emotionResult.emotion,
        confidence: emotionResult.confidence,
        category: emotionResult.category,
        text: `${emotionResult.emotion.icon} ${emotionResult.emotion.title}`,
        timestamp: Date.now()
      };
    }
    return null;
  }

  /**
   * 1秒窗口处理：四状态判断和上下文更新
   */
  processWindow() {
    const now = Date.now();
    
    // 更新LRU缓存
    this.updateImageLRU();
    
    // 四状态判断
    const hasVisualCat = this.hasVisualCat();
    const hasAudioCat = this.hasCatSound();
    
    const currentState = this.determineState(hasVisualCat, hasAudioCat);
    
    // 基于LRU信任机制更新焦点状态
    this.context.is_now_focusing_cat = this.calculateTrustBasedFocus(currentState);
    
    // 更新时间戳
    this.context.last_mewt_time = now;
    
    // 生成状态响应
    const response = this.generateStateResponse(currentState);
    
    // 清空当前窗口
    this.clearCurrentWindow();
    
    return response;
  }

  /**
   * 更新图像LRU缓存
   */
  updateImageLRU() {
    const now = Date.now();
    
    // 将当前窗口的图像结果添加到LRU
    for (const [className, score] of this.context.current.current_image) {
      this.context.image_lru.set(`${className}_${now}`, {
        class: className,
        score: score,
        timestamp: now,
        isCat: className.toLowerCase().includes('cat')
      });
    }
  }

  /**
   * 基于LRU信任机制计算焦点状态
   * @param {string} currentState - 当前状态
   * @returns {boolean}
   */
  calculateTrustBasedFocus(currentState) {
    // 如果当前没有检测到猫，检查LRU中最近的记录
    if (currentState === 'idle') {
      const recentDetections = this.context.image_lru.recent(this.config.LRU_TRUST_COUNT);
      const catDetections = recentDetections.filter(item => item.isCat);
      
      // 最近10次检测中有猫 = 保持焦点
      return catDetections.length > 0;
    }
    
    // 其他状态都表示有活跃检测
    return true;
  }

  /**
   * 确定四状态
   * @param {boolean} hasVisual - 是否有视觉猫检测
   * @param {boolean} hasAudio - 是否有音频猫检测
   * @returns {string}
   */
  determineState(hasVisual, hasAudio) {
    if (hasVisual && hasAudio) return 'cat_both';
    if (hasVisual) return 'cat_visual';
    if (hasAudio) return 'cat_audio';
    return 'idle';
  }

  /**
   * 生成状态响应
   * @param {string} state - 当前状态
   * @returns {Object}
   */
  generateStateResponse(state) {
    return {
      type: 'state',
      state: state,
      text: this.stateResponses[state],
      is_focusing_cat: this.context.is_now_focusing_cat,
      timestamp: Date.now()
    };
  }

  /**
   * 清空当前窗口数据
   */
  clearCurrentWindow() {
    this.context.current.current_image.clear();
    this.context.current.current_audio.clear();
    this.context.current.current_audio_feature = null;
    this.context.current.emotion_classification = null;
  }

  /**
   * 获取完整上下文 (调试用)
   */
  getFullContext() {
    return {
      ...this.context,
      current: {
        current_image: Object.fromEntries(this.context.current.current_image),
        current_audio: Object.fromEntries(this.context.current.current_audio),
        current_audio_feature: this.context.current.current_audio_feature,
        emotion_classification: this.context.current.emotion_classification
      }
    };
  }

  /**
   * 销毁定时器
   */
  destroy() {
    if (this.windowTimer) {
      clearInterval(this.windowTimer);
      this.windowTimer = null;
    }
  }
}

// 保持向后兼容的Mewt类
class Mewt extends ContextManager {
  constructor() {
    super();
  }

  // 向后兼容的方法
  generateQuickResponse(predictions) {
    // 转换旧格式到新格式
    if (predictions.image) {
      this.addImageResult(predictions.image);
    }
    
    if (predictions.audio) {
      const audioResponse = this.addAudioResult(predictions.audio);
      if (audioResponse) {
        return audioResponse.text;
      }
    }
    
    // 返回基础状态响应
    const hasVisual = this.hasVisualCat();
    const hasAudio = this.hasCatSound();
    const state = this.determineState(hasVisual, hasAudio);
    
    return this.stateResponses[state];
  }

  // 向后兼容的上下文获取
  getContext() {
    return {
      is_focusing_cat: this.context.is_now_focusing_cat,
      last_mewt_time: this.context.last_mewt_time,
      image_lru_size: this.context.image_lru.size(),
      current_window: this.getFullContext().current
    };
  }

  getCacheInfo() {
    return {
      image_lru_size: this.context.image_lru.size(),
      has_current_data: this.context.current.current_image.size > 0 || 
                       this.context.current.current_audio.size > 0
    };
  }
}

// 导出 Mewt 类
export default Mewt;
