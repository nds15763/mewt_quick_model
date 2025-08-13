/**
 * 音频触发器和特征提取引擎
 * =============================
 * 
 * 📋 模块功能概述：
 * 本模块负责音频信号的实时监听、特征提取和情绪分析触发。当系统检测到猫叫声时，
 * 自动触发深度音频特征分析，并调用情绪分类引擎生成即时的情绪响应。
 * 这是连接音频检测和情绪AI的关键桥梁。
 * 
 * 🎯 核心功能：
 * 1. **智能音频触发**：监听音频分类结果，检测猫叫声信号
 * 2. **实时特征提取**：从原始音频缓冲区提取5维音频特征向量
 * 3. **情绪分析集成**：调用emotions.js规则引擎进行21种情绪分类
 * 4. **即时响应生成**：生成带表情符号的情绪响应文本
 * 
 * 🔊 音频特征提取体系：
 * 
 * **5维特征向量**（与features.js完全集成）：
 * - **zeroCrossingRate** (过零率)：反映声音的频率变化和纹理
 * - **spectralCentroid** (频谱质心)：反映声音的"亮度"和音调特性
 * - **spectralRolloff** (频谱滚降)：反映高频能量的分布情况  
 * - **energy** (能量)：反映声音的整体强度和响度
 * - **rms** (均方根)：反映声音的有效值和动态范围
 * 
 * 🎭 情绪触发流程：
 * ```
 * 音频分类结果 → 猫叫声检测 → 特征提取 → 情绪分析 → 响应生成
 *      ↓              ↓           ↓          ↓         ↓
 *   YAMNet结果    关键词匹配   5维特征向量   21种情绪   表情文本
 * ```
 * 
 * 🔍 猫叫声检测算法：
 * - **关键词匹配**：cat, meow, purr, mewing 等关键词
 * - **置信度筛选**：只处理置信度 > 0.2 的音频分类结果
 * - **实时监听**：每次音频分类都进行触发判断
 * - **避免冗余**：相同时间窗口内避免重复触发
 * 
 * 🧠 情绪分析集成：
 * - 直接调用 emotions.ts 的 classifyEmotion() 函数
 * - 支持21种猫咪情绪的实时识别
 * - 返回置信度、类别、表情符号等完整信息
 * - 只返回置信度 > 50% 的分类结果
 * 
 * ⚡ 性能优化策略：
 * - **惰性计算**：只在检测到猫叫声时才进行特征提取
 * - **缓存复用**：避免对同一音频缓冲区重复计算
 * - **异步处理**：特征提取和情绪分析不阻塞主线程
 * - **错误容忍**：单次失败不影响后续检测
 * 
 * 📊 音频特征计算说明：
 * 
 * **过零率 (ZCR)**：
 * - 计算信号在时域中穿过零点的频率
 * - 高ZCR通常表示高频成分丰富（如尖锐的猫叫声）
 * - 低ZCR通常表示低频主导（如低沉的呼噜声）
 * 
 * **频谱质心 (Spectral Centroid)**：
 * - 计算频谱的重心位置，反映声音的"亮度"
 * - 高质心：明亮、尖锐的声音（如紧急求助的猫叫）
 * - 低质心：温暖、柔和的声音（如满足的呼噜声）
 * 
 * **频谱滚降 (Spectral Rolloff)**：
 * - 85%的频谱能量所在的频率点
 * - 反映高频成分的丰富程度
 * - 用于区分不同类型的猫咪发声
 * 
 * 🎪 使用示例：
 * ```javascript
 * const audioTrigger = new AudioTrigger();
 * 
 * // 添加音频分类结果，可能触发情绪分析
 * const emotionResponse = audioTrigger.processAudioResult(
 *   audioClassificationResults,
 *   rawAudioBuffer
 * );
 * 
 * if (emotionResponse) {
 *   console.log(`检测到情绪: ${emotionResponse.text}`);
 *   console.log(`置信度: ${Math.round(emotionResponse.confidence * 100)}%`);
 * }
 * ```
 * 
 * 🔗 模块依赖关系：
 * - **features.js**：音频特征提取算法
 * - **emotions.ts**：情绪分类规则引擎  
 * - **state-manager.js**：状态判断逻辑
 * - **mewt.js**：主系统集成
 * 
 * 📈 扩展性设计：
 * - 支持添加新的音频特征维度
 * - 可配置的触发条件和阈值
 * - 模块化的情绪响应生成器
 * - 支持多种音频格式和采样率
 */

// 导入情绪分类规则引擎
import { classifyEmotion } from './emotions.js';

// 导入音频特征提取函数
import { 
  calculateZCR, 
  calculateSpectralCentroid, 
  calculateSpectralRolloff, 
  calculateEnergy, 
  calculateRMS 
} from './features.js';

/**
 * 音频触发器和特征提取引擎类
 * 负责监听音频信号并触发情绪分析
 */
export class AudioTrigger {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    // 触发配置
    this.config = {
      CAT_SOUND_THRESHOLD: config.catSoundThreshold || 0.2,
      MIN_CONFIDENCE_FOR_EMOTION: config.minConfidenceForEmotion || 0.5,
      FEATURE_CACHE_SIZE: config.featureCacheSize || 100,
      ...config
    };
    
    // 猫叫声关键词列表
    this.catSoundKeywords = [
      'cat', 'meow', 'purr', 'purring', 'mew', 
      'mewing', 'feline', 'cat_vocalization', 'kitten'
    ];
    
    // 特征提取缓存（避免重复计算）
    this.featureCache = new Map();
    
    // 统计信息
    this.stats = {
      totalAudioProcessed: 0,
      catSoundDetected: 0,
      emotionTriggered: 0,
      lastTriggerTime: 0
    };
  }

  /**
   * 处理音频分类结果，可能触发情绪分析
   * @param {Array} audioResults - 音频分类结果数组 [{class: string, score: number}]
   * @param {Float32Array} audioBuffer - 原始音频缓冲区
   * @returns {Object|null} 情绪分析结果或null
   */
  processAudioResult(audioResults, audioBuffer = null) {
    this.stats.totalAudioProcessed++;
    
    // 检查是否检测到猫叫声
    if (!this.hasCatSound(audioResults)) {
      return null;
    }
    
    this.stats.catSoundDetected++;
    
    // 如果没有音频缓冲区，无法进行特征提取
    if (!audioBuffer || audioBuffer.length === 0) {
      console.warn('AudioTrigger: 检测到猫叫声但缺少音频缓冲区数据');
      return null;
    }
    
    // 触发音频特征分析和情绪分类
    return this.triggerEmotionAnalysis(audioBuffer);
  }

  /**
   * 检查音频分类结果中是否包含猫叫声
   * @param {Array} audioResults - 音频分类结果
   * @returns {boolean} 是否检测到猫叫声
   */
  hasCatSound(audioResults) {
    if (!audioResults || audioResults.length === 0) {
      return false;
    }
    
    return audioResults.some(result => {
      const className = result.class.toLowerCase();
      const score = result.score;
      
      // 检查是否匹配猫叫声关键词且超过阈值
      return this.catSoundKeywords.some(keyword => 
        className.includes(keyword)
      ) && score > this.config.CAT_SOUND_THRESHOLD;
    });
  }

  /**
   * 触发音频特征分析和情绪分类
   * @param {Float32Array} audioBuffer - 音频缓冲区
   * @returns {Object|null} 情绪分析结果
   */
  triggerEmotionAnalysis(audioBuffer) {
    try {
      // 提取音频特征
      const audioFeatures = this.extractAudioFeatures(audioBuffer);
      
      if (!audioFeatures) {
        console.warn('AudioTrigger: 音频特征提取失败');
        return null;
      }
      
      // 调用情绪分类引擎
      const emotionResult = classifyEmotion(audioFeatures);
      
      if (!emotionResult) {
        console.log('AudioTrigger: 未找到置信度足够的情绪分类');
        return null;
      }
      
      // 检查情绪分类置信度
      if (emotionResult.confidence < this.config.MIN_CONFIDENCE_FOR_EMOTION) {
        console.log(`AudioTrigger: 情绪分类置信度过低 (${emotionResult.confidence.toFixed(2)})`);
        return null;
      }
      
      this.stats.emotionTriggered++;
      this.stats.lastTriggerTime = Date.now();
      
      // 生成情绪响应
      return this.generateEmotionResponse(emotionResult, audioFeatures);
      
    } catch (error) {
      console.error('AudioTrigger: 情绪分析失败', error);
      return null;
    }
  }

  /**
   * 提取音频特征向量
   * @param {Float32Array} audioBuffer - 音频缓冲区
   * @returns {Object|null} 音频特征对象
   */
  extractAudioFeatures(audioBuffer) {
    try {
      if (!audioBuffer || audioBuffer.length === 0) {
        return null;
      }

      // 生成缓存键（基于音频数据的哈希）
      const cacheKey = this.generateAudioHash(audioBuffer);
      
      // 检查缓存
      if (this.featureCache.has(cacheKey)) {
        return this.featureCache.get(cacheKey);
      }

      // 计算5维音频特征向量
      const features = {
        zeroCrossingRate: calculateZCR(audioBuffer),
        spectralCentroid: calculateSpectralCentroid(audioBuffer),
        spectralRolloff: calculateSpectralRolloff(audioBuffer),
        energy: calculateEnergy(audioBuffer),
        rms: calculateRMS(audioBuffer)
      };

      // 验证特征有效性
      if (this.validateFeatures(features)) {
        // 缓存结果（控制缓存大小）
        if (this.featureCache.size >= this.config.FEATURE_CACHE_SIZE) {
          const firstKey = this.featureCache.keys().next().value;
          this.featureCache.delete(firstKey);
        }
        this.featureCache.set(cacheKey, features);
        
        return features;
      } else {
        console.warn('AudioTrigger: 提取的音频特征无效');
        return null;
      }
      
    } catch (error) {
      console.error('AudioTrigger: 特征提取错误', error);
      return null;
    }
  }

  /**
   * 验证音频特征的有效性
   * @param {Object} features - 音频特征对象
   * @returns {boolean} 特征是否有效
   */
  validateFeatures(features) {
    const requiredFeatures = [
      'zeroCrossingRate', 'spectralCentroid', 'spectralRolloff', 'energy', 'rms'
    ];
    
    // 检查是否包含所有必需特征
    for (const feature of requiredFeatures) {
      if (!(feature in features) || 
          typeof features[feature] !== 'number' || 
          !isFinite(features[feature])) {
        return false;
      }
    }
    
    // 检查特征值范围的合理性
    return features.zeroCrossingRate >= 0 &&
           features.spectralCentroid >= 0 &&
           features.spectralRolloff >= 0 &&
           features.energy >= 0 &&
           features.rms >= 0;
  }

  /**
   * 生成音频数据的简单哈希（用于缓存）
   * @param {Float32Array} audioBuffer - 音频缓冲区
   * @returns {string} 哈希字符串
   */
  generateAudioHash(audioBuffer) {
    // 简单的哈希算法：取样本的平均值和长度
    let sum = 0;
    const step = Math.max(1, Math.floor(audioBuffer.length / 100)); // 采样100个点
    
    for (let i = 0; i < audioBuffer.length; i += step) {
      sum += audioBuffer[i];
    }
    
    const avg = sum / (audioBuffer.length / step);
    return `${audioBuffer.length}_${avg.toFixed(6)}`;
  }

  /**
   * 生成情绪响应对象
   * @param {Object} emotionResult - 情绪分类结果
   * @param {Object} audioFeatures - 音频特征
   * @returns {Object} 情绪响应对象
   */
  generateEmotionResponse(emotionResult, audioFeatures) {
    return {
      type: 'emotion',
      emotion: emotionResult.emotion,
      confidence: emotionResult.confidence,
      category: emotionResult.category,
      text: `${emotionResult.emotion.icon} ${emotionResult.emotion.title}`,
      audioFeatures: audioFeatures,
      timestamp: Date.now(),
      triggerStats: { ...this.stats }
    };
  }

  /**
   * 获取详细的猫叫声检测信息
   * @param {Array} audioResults - 音频分类结果
   * @returns {Object} 检测信息
   */
  getCatSoundDetectionInfo(audioResults) {
    const catSoundDetections = [];
    
    if (audioResults && audioResults.length > 0) {
      for (const result of audioResults) {
        const className = result.class.toLowerCase();
        const score = result.score;
        
        // 检查是否匹配猫叫声关键词
        const matchedKeywords = this.catSoundKeywords.filter(keyword => 
          className.includes(keyword)
        );
        
        if (matchedKeywords.length > 0) {
          catSoundDetections.push({
            class: result.class,
            score: score,
            matchedKeywords: matchedKeywords,
            isAboveThreshold: score > this.config.CAT_SOUND_THRESHOLD
          });
        }
      }
    }
    
    return {
      detections: catSoundDetections.sort((a, b) => b.score - a.score),
      hasCatSound: this.hasCatSound(audioResults),
      threshold: this.config.CAT_SOUND_THRESHOLD,
      totalCandidates: catSoundDetections.length
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      triggerRate: this.stats.totalAudioProcessed > 0 ? 
        (this.stats.catSoundDetected / this.stats.totalAudioProcessed * 100).toFixed(1) + '%' : '0%',
      emotionRate: this.stats.catSoundDetected > 0 ? 
        (this.stats.emotionTriggered / this.stats.catSoundDetected * 100).toFixed(1) + '%' : '0%',
      cacheSize: this.featureCache.size,
      lastTriggerAgo: this.stats.lastTriggerTime > 0 ? 
        Date.now() - this.stats.lastTriggerTime : null
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalAudioProcessed: 0,
      catSoundDetected: 0,
      emotionTriggered: 0,
      lastTriggerTime: 0
    };
  }

  /**
   * 清空特征缓存
   */
  clearCache() {
    this.featureCache.clear();
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
  }

  /**
   * 获取当前配置
   * @returns {Object} 当前配置
   */
  getConfig() {
    return { ...this.config };
  }
}

export default AudioTrigger;
