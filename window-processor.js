/**
 * 时间窗口处理器
 * ================
 * 
 * 📋 模块功能概述：
 * 本模块实现了基于1秒时间窗口的数据聚合和处理机制。负责收集实时的图像和音频检测结果，
 * 在固定的时间间隔内进行数据整合、状态分析和响应生成。这是整个系统的时间同步核心。
 * 
 * 🎯 核心功能：
 * 1. **1秒窗口聚合**：在1秒的时间窗口内收集所有检测结果
 * 2. **数据去重优化**：同类别检测结果保留最高置信度
 * 3. **定时状态更新**：每秒触发状态分析和LRU缓存更新
 * 4. **响应生成管理**：协调状态响应和情绪响应的输出
 * 
 * ⏱️ 时间窗口工作原理：
 * ```
 * 0-1秒窗口: [收集数据] → [1秒触发] → [状态分析] → [清空窗口] → [下一窗口]
 *     ↓           ↓             ↓            ↓           ↓
 * 实时检测    聚合去重    四状态判断    LRU更新    重新开始
 * ```
 * 
 * 🗂️ 窗口数据结构：
 * - **currentImageMap**: Map<className, maxScore> - 图像检测结果去重
 * - **currentAudioMap**: Map<className, maxScore> - 音频检测结果去重
 * - **currentAudioFeature**: 最新的音频特征向量
 * - **emotionClassification**: 最新的情绪分析结果
 * 
 * 🔄 数据聚合策略：
 * 
 * **同类别去重算法**：
 * - 在1秒窗口内，同一类别的多次检测只保留最高置信度
 * - 例如："cat"类别在窗口内检测到0.7、0.8、0.6，最终保留0.8
 * - 这样避免了同一对象的重复计数，提高检测准确性
 * 
 * **时间戳管理**：
 * - 记录窗口开始时间和结束时间
 * - 跟踪最后处理时间，用于性能监控
 * - 支持窗口处理频率的统计分析
 * 
 * 🎭 状态处理流程：
 * 
 * **窗口触发时执行以下步骤**：
 * 1. 调用StateManager进行四状态分析
 * 2. 更新LRUCache存储检测历史
 * 3. 计算基于历史的信任度
 * 4. 生成状态响应对象
 * 5. 清空当前窗口数据
 * 6. 更新系统时间戳
 * 
 * 🚀 性能优化特性：
 * - **惰性计算**：只在窗口触发时进行复杂计算
 * - **内存管理**：窗口结束后立即清理数据
 * - **异步处理**：不阻塞实时数据收集
 * - **可配置间隔**：支持动态调整窗口大小
 * 
 * 📊 统计和监控：
 * - 窗口处理次数统计
 * - 平均处理时间监控
 * - 数据收集量统计
 * - 状态变化频率分析
 * 
 * 🔗 模块集成接口：
 * - **addImageData()**: 添加图像检测结果到当前窗口
 * - **addAudioData()**: 添加音频检测结果到当前窗口
 * - **processWindow()**: 手动触发窗口处理
 * - **startAutoProcessing()**: 启动自动定时处理
 * - **stopAutoProcessing()**: 停止自动处理
 * 
 * 🎪 使用示例：
 * ```javascript
 * const processor = new WindowProcessor({
 *   interval: 1000,  // 1秒窗口
 *   stateManager: stateManager,
 *   lruCache: lruCache
 * });
 * 
 * // 添加检测数据
 * processor.addImageData([{class: 'cat', score: 0.8}]);
 * processor.addAudioData([{class: 'meow', score: 0.7}]);
 * 
 * // 启动自动处理
 * processor.startAutoProcessing((response) => {
 *   console.log('窗口处理结果:', response);
 * });
 * ```
 * 
 * 📈 扩展性设计：
 * - 支持多种窗口大小配置
 * - 可插拔的数据处理器
 * - 支持自定义聚合策略
 * - 兼容未来的新数据类型
 */

/**
 * 时间窗口处理器类
 * 负责1秒窗口的数据聚合和定时处理
 */
export class WindowProcessor {
  /**
   * 构造函数
   * @param {Object} config - 配置对象
   */
  constructor(config = {}) {
    // 配置参数
    this.config = {
      WINDOW_INTERVAL: config.interval || 1000,  // 窗口间隔（毫秒）
      AUTO_START: config.autoStart || false,     // 是否自动启动
      ...config
    };
    
    // 依赖注入
    this.stateManager = config.stateManager;
    this.lruCache = config.lruCache;
    
    // 当前窗口数据
    this.currentWindow = {
      currentImageMap: new Map(),
      currentAudioMap: new Map(),
      currentAudioFeature: null,
      emotionClassification: null
    };
    
    // 时间管理
    this.timing = {
      windowStartTime: Date.now(),
      lastProcessTime: 0,
      totalWindows: 0,
      totalProcessingTime: 0
    };
    
    // 定时器
    this.windowTimer = null;
    this.isProcessing = false;
    
    // 回调函数
    this.onWindowProcessed = null;
    
    // 统计信息
    this.stats = {
      totalImageDataAdded: 0,
      totalAudioDataAdded: 0,
      totalWindowsProcessed: 0,
      averageProcessingTime: 0,
      lastWindowSize: { image: 0, audio: 0 }
    };
    
    // 如果设置了自动启动，立即开始
    if (this.config.AUTO_START) {
      this.startAutoProcessing();
    }
  }

  /**
   * 添加图像检测数据到当前窗口
   * @param {Array} imageResults - 图像检测结果 [{class: string, score: number}]
   */
  addImageData(imageResults) {
    if (!imageResults || imageResults.length === 0) return;
    
    this.stats.totalImageDataAdded++;
    
    // 同类别去重，保留最高分数
    imageResults.forEach(result => {
      const className = result.class;
      const score = result.score;
      
      if (!this.currentWindow.currentImageMap.has(className) || 
          this.currentWindow.currentImageMap.get(className) < score) {
        this.currentWindow.currentImageMap.set(className, score);
      }
    });
  }

  /**
   * 添加音频检测数据到当前窗口
   * @param {Array} audioResults - 音频检测结果 [{class: string, score: number}]
   * @param {Object} audioFeature - 音频特征（可选）
   * @param {Object} emotionResult - 情绪分析结果（可选）
   */
  addAudioData(audioResults, audioFeature = null, emotionResult = null) {
    if (!audioResults || audioResults.length === 0) return;
    
    this.stats.totalAudioDataAdded++;
    
    // 同类别去重，保留最高分数
    audioResults.forEach(result => {
      const className = result.class;
      const score = result.score;
      
      if (!this.currentWindow.currentAudioMap.has(className) || 
          this.currentWindow.currentAudioMap.get(className) < score) {
        this.currentWindow.currentAudioMap.set(className, score);
      }
    });
    
    // 更新音频特征和情绪分析（如果提供）
    if (audioFeature) {
      this.currentWindow.currentAudioFeature = audioFeature;
    }
    
    if (emotionResult) {
      this.currentWindow.emotionClassification = emotionResult;
    }
  }

  /**
   * 处理当前窗口数据
   * @returns {Object} 窗口处理结果
   */
  processWindow() {
    if (this.isProcessing) {
      console.warn('WindowProcessor: 窗口正在处理中，跳过本次处理');
      return null;
    }
    
    this.isProcessing = true;
    const processStartTime = Date.now();
    
    try {
      // 更新统计信息
      this.stats.lastWindowSize = {
        image: this.currentWindow.currentImageMap.size,
        audio: this.currentWindow.currentAudioMap.size
      };
      
      // 如果没有状态管理器，只进行基础处理
      if (!this.stateManager) {
        const basicResponse = this.generateBasicResponse();
        this.cleanupWindow(processStartTime);
        return basicResponse;
      }
      
      // 使用状态管理器分析当前状态
      const currentState = this.stateManager.analyzeCurrentState(
        this.currentWindow.currentImageMap,
        this.currentWindow.currentAudioMap
      );
      
      // 更新LRU缓存（如果可用）
      this.updateLRUCache();
      
      // 计算基于信任机制的关注状态
      const isFocusing = this.calculateFocusState(currentState);
      
      // 生成状态响应
      const stateResponse = this.stateManager.generateStateResponse(currentState, isFocusing);
      
      // 添加窗口特定信息
      const windowResponse = {
        ...stateResponse,
        windowInfo: {
          windowId: this.timing.totalWindows + 1,
          imageDetections: this.currentWindow.currentImageMap.size,
          audioDetections: this.currentWindow.currentAudioMap.size,
          hasAudioFeature: !!this.currentWindow.currentAudioFeature,
          hasEmotionResult: !!this.currentWindow.emotionClassification,
          processingTime: Date.now() - processStartTime
        }
      };
      
      // 清理窗口和更新统计
      this.cleanupWindow(processStartTime);
      
      // 调用回调函数
      if (this.onWindowProcessed) {
        try {
          this.onWindowProcessed(windowResponse);
        } catch (error) {
          console.error('WindowProcessor: 回调函数执行失败', error);
        }
      }
      
      return windowResponse;
      
    } catch (error) {
      console.error('WindowProcessor: 窗口处理失败', error);
      this.cleanupWindow(processStartTime);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 生成基础响应（无状态管理器时）
   * @returns {Object} 基础响应对象
   */
  generateBasicResponse() {
    return {
      type: 'window',
      state: 'unknown',
      text: '数据收集中...',
      is_focusing_cat: false,
      timestamp: Date.now(),
      windowInfo: {
        windowId: this.timing.totalWindows + 1,
        imageDetections: this.currentWindow.currentImageMap.size,
        audioDetections: this.currentWindow.currentAudioMap.size,
        hasAudioFeature: !!this.currentWindow.currentAudioFeature,
        hasEmotionResult: !!this.currentWindow.emotionClassification
      }
    };
  }

  /**
   * 更新LRU缓存
   */
  updateLRUCache() {
    if (!this.lruCache) return;
    
    const now = Date.now();
    
    // 将当前窗口的图像结果添加到LRU
    for (const [className, score] of this.currentWindow.currentImageMap) {
      this.lruCache.set(`${className}_${now}`, {
        class: className,
        score: score,
        timestamp: now,
        isCat: this.stateManager ? this.stateManager.isCatClass(className) : false
      });
    }
  }

  /**
   * 计算基于信任机制的关注状态
   * @param {string} currentState - 当前状态
   * @returns {boolean} 是否关注猫咪
   */
  calculateFocusState(currentState) {
    // 如果当前状态不是idle，直接返回true
    if (currentState !== 'idle') {
      return true;
    }
    
    // 如果没有LRU缓存，返回false
    if (!this.lruCache) {
      return false;
    }
    
    // 检查最近的检测历史
    const recentDetections = this.lruCache.recent(10);
    const catDetections = recentDetections.filter(item => item.isCat);
    
    // 最近10次检测中有猫 = 保持焦点
    return catDetections.length > 0;
  }

  /**
   * 清理窗口数据并更新统计
   * @param {number} processStartTime - 处理开始时间
   */
  cleanupWindow(processStartTime) {
    // 清空当前窗口数据
    this.currentWindow.currentImageMap.clear();
    this.currentWindow.currentAudioMap.clear();
    this.currentWindow.currentAudioFeature = null;
    this.currentWindow.emotionClassification = null;
    
    // 更新时间统计
    const processingTime = Date.now() - processStartTime;
    this.timing.totalWindows++;
    this.timing.lastProcessTime = Date.now();
    this.timing.totalProcessingTime += processingTime;
    this.timing.windowStartTime = Date.now();
    
    // 更新统计信息
    this.stats.totalWindowsProcessed++;
    this.stats.averageProcessingTime = 
      this.timing.totalProcessingTime / this.timing.totalWindows;
  }

  /**
   * 启动自动窗口处理
   * @param {Function} callback - 窗口处理完成的回调函数
   */
  startAutoProcessing(callback = null) {
    // 设置回调函数
    if (callback) {
      this.onWindowProcessed = callback;
    }
    
    // 如果已经在运行，先停止
    if (this.windowTimer) {
      this.stopAutoProcessing();
    }
    
    // 启动定时器
    this.windowTimer = setInterval(() => {
      this.processWindow();
    }, this.config.WINDOW_INTERVAL);
    
    console.log(`WindowProcessor: 自动处理已启动，间隔 ${this.config.WINDOW_INTERVAL}ms`);
  }

  /**
   * 停止自动窗口处理
   */
  stopAutoProcessing() {
    if (this.windowTimer) {
      clearInterval(this.windowTimer);
      this.windowTimer = null;
      console.log('WindowProcessor: 自动处理已停止');
    }
  }

  /**
   * 手动触发窗口处理
   * @returns {Object} 处理结果
   */
  manualProcess() {
    return this.processWindow();
  }

  /**
   * 获取当前窗口状态
   * @returns {Object} 窗口状态信息
   */
  getCurrentWindowState() {
    return {
      imageDetections: Array.from(this.currentWindow.currentImageMap.entries()),
      audioDetections: Array.from(this.currentWindow.currentAudioMap.entries()),
      hasAudioFeature: !!this.currentWindow.currentAudioFeature,
      hasEmotionResult: !!this.currentWindow.emotionClassification,
      windowAge: Date.now() - this.timing.windowStartTime,
      isProcessing: this.isProcessing
    };
  }

  /**
   * 获取统计信息
   * @returns {Object} 统计信息
   */
  getStats() {
    return {
      ...this.stats,
      timing: { ...this.timing },
      isRunning: !!this.windowTimer,
      config: { ...this.config }
    };
  }

  /**
   * 重置统计信息
   */
  resetStats() {
    this.stats = {
      totalImageDataAdded: 0,
      totalAudioDataAdded: 0,
      totalWindowsProcessed: 0,
      averageProcessingTime: 0,
      lastWindowSize: { image: 0, audio: 0 }
    };
    
    this.timing = {
      windowStartTime: Date.now(),
      lastProcessTime: 0,
      totalWindows: 0,
      totalProcessingTime: 0
    };
  }

  /**
   * 更新配置
   * @param {Object} newConfig - 新配置
   */
  updateConfig(newConfig) {
    const oldInterval = this.config.WINDOW_INTERVAL;
    Object.assign(this.config, newConfig);
    
    // 如果间隔改变且正在运行，重启定时器
    if (newConfig.WINDOW_INTERVAL && 
        newConfig.WINDOW_INTERVAL !== oldInterval && 
        this.windowTimer) {
      this.stopAutoProcessing();
      this.startAutoProcessing();
    }
  }

  /**
   * 销毁处理器，清理资源
   */
  destroy() {
    this.stopAutoProcessing();
    this.currentWindow.currentImageMap.clear();
    this.currentWindow.currentAudioMap.clear();
    this.currentWindow.currentAudioFeature = null;
    this.currentWindow.emotionClassification = null;
    this.onWindowProcessed = null;
  }
}

export default WindowProcessor;
