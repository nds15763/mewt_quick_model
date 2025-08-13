/**
 * Mewt 核心系统 - 模块化架构主集成器
 * ========================================
 * 
 * 📋 系统功能概述：
 * 本模块是Mewt猫咪检测系统的核心集成器，负责协调所有子模块的工作，提供统一的API接口。
 * 通过模块化设计，实现了高内聚低耦合的系统架构，便于维护和扩展。
 * 
 * 🎯 核心功能：
 * 1. **模块集成管理**：协调LRU缓存、状态管理、音频触发器和窗口处理器
 * 2. **统一API接口**：为外部系统提供简洁易用的调用接口
 * 3. **向后兼容性**：保持与旧版本API的完全兼容
 * 4. **生命周期管理**：统一管理所有子模块的初始化和销毁
 * 
 * 🏗️ 系统架构：
 * ```
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    Mewt Core System                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  LRUCache    │  StateManager  │  AudioTrigger  │  WindowProc│
 * │  (信任机制)   │   (四状态)     │   (情绪分析)    │  (时间窗口) │
 * └─────────────────────────────────────────────────────────────┘
 *           ↓                    ↓                    ↓
 * ┌─────────────────────────────────────────────────────────────┐
 * │  emotions.ts (情绪规则)  │  features.js (音频特征)        │
 * └─────────────────────────────────────────────────────────────┘
 * ```
 * 
 * 🔄 数据流向：
 * 1. **实时数据输入** → addImageResult() / addAudioResult()
 * 2. **窗口聚合** → WindowProcessor 收集1秒内的数据
 * 3. **状态分析** → StateManager 进行四状态判断
 * 4. **信任机制** → LRUCache 提供历史信任度
 * 5. **音频触发** → AudioTrigger 检测猫叫声并分析情绪
 * 6. **响应输出** → 生成状态响应或情绪响应
 * 
 * 🎭 工作模式：
 * 
 * **实时模式**：
 * - 持续接收图像和音频分类结果
 * - 每1秒自动处理窗口数据
 * - 即时情绪分析触发
 * - 适合Web界面的实时交互
 * 
 * **批处理模式**：
 * - 手动触发窗口处理
 * - 适合离线分析和测试
 * - 支持自定义处理时机
 * 
 * 🚀 性能特性：
 * - **模块化设计**：各模块独立运行，互不干扰
 * - **智能缓存**：LRU机制避免重复计算
 * - **惰性加载**：只在需要时进行复杂分析
 * - **内存管理**：自动清理过期数据
 * 
 * 📊 API接口分类：
 * 
 * **数据输入接口**：
 * - addImageResult(): 添加图像检测结果
 * - addAudioResult(): 添加音频检测结果（可触发情绪分析）
 * 
 * **状态查询接口**：
 * - hasVisualCat(): 检查是否有视觉猫检测
 * - hasCatSound(): 检查是否有音频猫检测
 * - determineState(): 获取当前四状态
 * 
 * **窗口处理接口**：
 * - processWindow(): 手动触发窗口处理
 * - startAutoProcessing(): 启动自动处理
 * - stopAutoProcessing(): 停止自动处理
 * 
 * **兼容性接口**：
 * - generateQuickResponse(): 向后兼容的快速响应
 * - getContext(): 向后兼容的上下文获取
 * - getCacheInfo(): 向后兼容的缓存信息
 * 
 * 🎪 使用示例：
 * ```javascript
 * // 基础使用
 * const mewt = new MewtCore();
 * 
 * // 添加检测结果
 * mewt.addImageResult([{class: 'cat', score: 0.8}]);
 * const emotionResponse = mewt.addAudioResult([{class: 'meow', score: 0.7}], audioBuffer);
 * 
 * // 启动自动处理
 * mewt.startAutoProcessing((response) => {
 *   console.log('系统响应:', response.text);
 * });
 * 
 * // 向后兼容模式
 * const quickResponse = mewt.generateQuickResponse({
 *   image: [{categoryName: 'cat', score: 0.8}],
 *   audio: [{categoryName: 'meow', score: 0.7}]
 * });
 * ```
 * 
 * 🔧 配置选项：
 * - windowInterval: 窗口处理间隔（默认1000ms）
 * - lruCacheSize: LRU缓存大小（默认20）
 * - catDetectionThreshold: 猫检测阈值（默认0.3）
 * - catSoundThreshold: 猫叫声阈值（默认0.2）
 * - autoStart: 是否自动启动（默认false）
 * 
 * 📈 扩展能力：
 * - 支持插件式的新模块集成
 * - 可配置的处理策略
 * - 支持多种数据源适配
 * - 便于集成到更大的AI系统
 * 
 * 🔗 模块依赖：
 * - LRUCache: 历史数据信任机制
 * - StateManager: 四状态分类逻辑
 * - AudioTrigger: 音频特征和情绪分析
 * - WindowProcessor: 时间窗口聚合处理
 * - emotions.ts: 情绪分类规则引擎
 * - features.js: 音频特征提取算法
 */

// 导入所有子模块
import LRUCache from './lru-cache.js';
import StateManager from './state-manager.js';
import AudioTrigger from './audio-trigger.js';
import WindowProcessor from './window-processor.js';

/**
 * Mewt核心系统类
 * 集成所有子模块，提供统一的API接口
 */
export class MewtCore {
  /**
   * 构造函数
   * @param {Object} config - 系统配置对象
   */
  constructor(config = {}) {
    // 系统配置
    this.config = {
      // 窗口处理配置
      windowInterval: config.windowInterval || 1000,
      autoStart: config.autoStart || false,
      
      // LRU缓存配置
      lruCacheSize: config.lruCacheSize || 20,
      lruTrustCount: config.lruTrustCount || 10,
      
      // 检测阈值配置
      catDetectionThreshold: config.catDetectionThreshold || 0.3,
      catSoundThreshold: config.catSoundThreshold || 0.2,
      
      // 音频触发配置
      minConfidenceForEmotion: config.minConfidenceForEmotion || 0.5,
      featureCacheSize: config.featureCacheSize || 100,
      
      ...config
    };
    
    // 初始化子模块
    this.initializeModules();
    
    // 系统状态
    this.isRunning = false;
    
    // 向后兼容的状态文本
    this.stateResponses = {
      'idle': '观察中...',
      'cat_visual': '那里有只小猫',
      'cat_audio': '诶？我好像听到小猫叫了',
      'cat_both': '哦！是个小猫'
    };
  }

  /**
   * 初始化所有子模块
   */
  initializeModules() {
    // 初始化LRU缓存
    this.lruCache = new LRUCache(this.config.lruCacheSize);
    
    // 初始化状态管理器
    this.stateManager = new StateManager({
      catDetectionThreshold: this.config.catDetectionThreshold,
      catSoundThreshold: this.config.catSoundThreshold
    });
    
    // 初始化音频触发器
    this.audioTrigger = new AudioTrigger({
      catSoundThreshold: this.config.catSoundThreshold,
      minConfidenceForEmotion: this.config.minConfidenceForEmotion,
      featureCacheSize: this.config.featureCacheSize
    });
    
    // 初始化窗口处理器
    this.windowProcessor = new WindowProcessor({
      interval: this.config.windowInterval,
      autoStart: this.config.autoStart,
      stateManager: this.stateManager,
      lruCache: this.lruCache
    });
  }

  // ==================== 数据输入接口 ====================

  /**
   * 添加图像检测结果
   * @param {Array} classResults - 图像分类结果 [{class: string, score: number}]
   */
  addImageResult(classResults) {
    if (!classResults || classResults.length === 0) return;
    
    // 添加到窗口处理器
    this.windowProcessor.addImageData(classResults);
  }

  /**
   * 添加音频检测结果，可能触发情绪分析
   * @param {Array} classResults - 音频分类结果 [{class: string, score: number}]
   * @param {Float32Array} audioBuffer - 原始音频缓冲区（可选）
   * @returns {Object|null} 情绪分析结果
   */
  addAudioResult(classResults, audioBuffer = null) {
    if (!classResults || classResults.length === 0) return null;
    
    // 音频触发器处理（可能触发情绪分析）
    const emotionResponse = this.audioTrigger.processAudioResult(classResults, audioBuffer);
    
    // 添加到窗口处理器
    this.windowProcessor.addAudioData(
      classResults,
      emotionResponse?.audioFeatures,
      emotionResponse
    );
    
    return emotionResponse;
  }

  // ==================== 状态查询接口 ====================

  /**
   * 检查当前是否有视觉猫检测
   * @returns {boolean}
   */
  hasVisualCat() {
    const currentWindow = this.windowProcessor.getCurrentWindowState();
    const imageMap = new Map(currentWindow.imageDetections);
    return this.stateManager.hasVisualCat(imageMap);
  }

  /**
   * 检查当前是否有音频猫检测
   * @returns {boolean}
   */
  hasCatSound() {
    const currentWindow = this.windowProcessor.getCurrentWindowState();
    const audioMap = new Map(currentWindow.audioDetections);
    return this.stateManager.hasCatSound(audioMap);
  }

  /**
   * 确定当前四状态
   * @returns {string}
   */
  determineState() {
    const hasVisual = this.hasVisualCat();
    const hasAudio = this.hasCatSound();
    return this.stateManager.determineState(hasVisual, hasAudio);
  }

  // ==================== 窗口处理接口 ====================

  /**
   * 手动触发窗口处理
   * @returns {Object} 处理结果
   */
  processWindow() {
    return this.windowProcessor.processWindow();
  }

  /**
   * 启动自动窗口处理
   * @param {Function} callback - 处理完成回调
   */
  startAutoProcessing(callback = null) {
    this.windowProcessor.startAutoProcessing(callback);
    this.isRunning = true;
  }

  /**
   * 停止自动窗口处理
   */
  stopAutoProcessing() {
    this.windowProcessor.stopAutoProcessing();
    this.isRunning = false;
  }

  // ==================== 向后兼容接口 ====================

  /**
   * 向后兼容的快速响应生成
   * @param {Object} predictions - 预测结果对象
   * @returns {string} 响应文本
   */
  generateQuickResponse(predictions) {
    // 转换旧格式到新格式
    if (predictions.image) {
      const imageResults = predictions.image.map(item => ({
        class: item.categoryName || item.class,
        score: item.score
      }));
      this.addImageResult(imageResults);
    }
    
    if (predictions.audio) {
      const audioResults = predictions.audio.map(item => ({
        class: item.categoryName || item.class,
        score: item.score
      }));
      const audioResponse = this.addAudioResult(audioResults);
      
      // 如果有情绪响应，返回情绪文本
      if (audioResponse) {
        return audioResponse.text;
      }
    }
    
    // 返回基础状态响应
    const state = this.determineState();
    return this.stateResponses[state];
  }

  /**
   * 向后兼容的上下文获取
   * @returns {Object} 上下文对象
   */
  getContext() {
    const windowState = this.windowProcessor.getCurrentWindowState();
    const stats = this.windowProcessor.getStats();
    
    return {
      is_focusing_cat: this.calculateCurrentFocus(),
      last_mewt_time: stats.timing.lastProcessTime,
      image_lru_size: this.lruCache.size(),
      current_window: {
        current_image: Object.fromEntries(windowState.imageDetections),
        current_audio: Object.fromEntries(windowState.audioDetections),
        current_audio_feature: windowState.hasAudioFeature ? 'available' : null,
        emotion_classification: windowState.hasEmotionResult ? 'available' : null
      }
    };
  }

  /**
   * 向后兼容的缓存信息获取
   * @returns {Object} 缓存信息
   */
  getCacheInfo() {
    const windowState = this.windowProcessor.getCurrentWindowState();
    
    return {
      image_lru_size: this.lruCache.size(),
      has_current_data: windowState.imageDetections.length > 0 || 
                       windowState.audioDetections.length > 0
    };
  }

  /**
   * 计算当前关注状态
   * @returns {boolean}
   */
  calculateCurrentFocus() {
    const currentState = this.determineState();
    
    if (currentState !== 'idle') {
      return true;
    }
    
    // 检查LRU历史
    const recent = this.lruCache.recent(this.config.lruTrustCount);
    return recent.some(item => item.isCat);
  }

  // ==================== 系统管理接口 ====================

  /**
   * 获取完整的系统状态
   * @returns {Object} 系统状态
   */
  getFullSystemState() {
    return {
      isRunning: this.isRunning,
      config: { ...this.config },
      modules: {
        lruCache: this.lruCache.getStats(),
        stateManager: this.stateManager.getConfig(),
        audioTrigger: this.audioTrigger.getStats(),
        windowProcessor: this.windowProcessor.getStats()
      },
      currentWindow: this.windowProcessor.getCurrentWindowState(),
      currentState: this.determineState()
    };
  }

  /**
   * 更新系统配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
    
    // 更新子模块配置
    if (newConfig.catDetectionThreshold !== undefined || 
        newConfig.catSoundThreshold !== undefined) {
      this.stateManager.updateThresholds({
        catDetectionThreshold: this.config.catDetectionThreshold,
        catSoundThreshold: this.config.catSoundThreshold
      });
    }
    
    if (newConfig.windowInterval !== undefined) {
      this.windowProcessor.updateConfig({
        WINDOW_INTERVAL: this.config.windowInterval
      });
    }
    
    if (newConfig.minConfidenceForEmotion !== undefined ||
        newConfig.featureCacheSize !== undefined) {
      this.audioTrigger.updateConfig({
        MIN_CONFIDENCE_FOR_EMOTION: this.config.minConfidenceForEmotion,
        FEATURE_CACHE_SIZE: this.config.featureCacheSize
      });
    }
  }

  /**
   * 重置所有统计信息
   */
  resetAllStats() {
    this.windowProcessor.resetStats();
    this.audioTrigger.resetStats();
  }

  /**
   * 清空所有缓存
   */
  clearAllCaches() {
    this.lruCache.clear();
    this.audioTrigger.clearCache();
  }

  /**
   * 销毁系统，清理所有资源
   */
  destroy() {
    // 停止自动处理
    this.stopAutoProcessing();
    
    // 销毁子模块
    this.windowProcessor.destroy();
    this.audioTrigger.clearCache();
    this.lruCache.clear();
    
    // 清理引用
    this.lruCache = null;
    this.stateManager = null;
    this.audioTrigger = null;
    this.windowProcessor = null;
    
    this.isRunning = false;
    
    console.log('MewtCore: 系统已销毁');
  }

  // ==================== 调试和监控接口 ====================

  /**
   * 获取详细的调试信息
   * @returns {Object} 调试信息
   */
  getDebugInfo() {
    const currentWindow = this.windowProcessor.getCurrentWindowState();
    const imageMap = new Map(currentWindow.imageDetections);
    const audioMap = new Map(currentWindow.audioDetections);
    
    return {
      timestamp: Date.now(),
      systemState: this.getFullSystemState(),
      detectionDetails: this.stateManager.getDetailedDetectionInfo(imageMap, audioMap),
      audioTriggerInfo: this.audioTrigger.getCatSoundDetectionInfo(
        currentWindow.audioDetections.map(([className, score]) => ({
          class: className,
          score: score
        }))
      ),
      recentHistory: this.lruCache.recent(5)
    };
  }

  /**
   * 启用调试模式（输出详细日志）
   */
  enableDebugMode() {
    this.debugMode = true;
    console.log('MewtCore: 调试模式已启用');
  }

  /**
   * 禁用调试模式
   */
  disableDebugMode() {
    this.debugMode = false;
    console.log('MewtCore: 调试模式已禁用');
  }
}

// 保持向后兼容的Mewt类（继承自MewtCore）
export class Mewt extends MewtCore {
  constructor(config = {}) {
    super(config);
  }
}

// 导出主类和向后兼容类
export default MewtCore;
