/**
 * 业务域：猫咪检测引擎核心
 * 业务域简述：整合 MediaPipe 音视频检测、Mewt 状态机、VLM 视觉分析、RN 消息通讯的统一引擎，
 *           为 debug.html 和 play.html 提供一致的检测逻辑和状态管理。
 * 
 * 核心方法清单：
 * - 初始化引擎 constructor @mewt-engine.js#L80-L145
 * - 处理图像检测结果 handleImageResult @mewt-engine.js#L169-L197
 * - 处理音频检测结果 handleAudioResult @mewt-engine.js#L216-L245
 * - 更新检测状态 updateState @mewt-engine.js#L263-L326
 * - 处理状态变化 handleStateChange @mewt-engine.js#L345-L376
 * - 获取当前视频帧 getCurrentFrame @mewt-engine.js#L393-L425
 * - 处理RN消息 handleRNMessage @mewt-engine.js#L508-L572
 */

import Mewt from './mewt.js';
import { VLMChannel } from './vlm-manager.js';
import { StateManager } from './state-manager.js';
import { WindowProcessor } from './window-processor.js';
import sendToRN from './rn-bridge.js';
import rnReceiver from './rn-message-receiver.js';
import { STATE_MESSAGES, SYSTEM_MESSAGES } from './messages-config.js';
import { 
  StateChangeObserverManager,
  RNMessengerObserver,
  AudioEmotionObserver,
  VLMTriggerObserver,
  LoggerObserver,
  UINotifierObserver
} from './state-change-observer.js';
import { ServiceWorkerManager } from './sw-manager.js';

/**
 * Mewt 检测引擎类
 * 统一管理音视频检测、状态判断、VLM 分析、RN 通讯的核心引擎
 */
export class MewtEngine {
  /*
  方法名：初始化引擎
  方法简介：创建 MewtEngine 实例，初始化所有子模块和观察者系统，
            注册状态变化观察者，配置 RN 消息处理器。
  业务域关键词：引擎初始化、观察者模式、状态管理器、VLM管理、观察者注册、RN消息
  Param: config - 配置对象，包含回调函数和各模块配置
  */
  constructor(config = {}) {
    // ========== 核心模块初始化 ==========
    
    // Mewt 核心实例（数据收集 + LRU 缓存）
    this.mewt = new Mewt();
    
    // 状态管理器
    this.stateManager = new StateManager({
      catDetectionThreshold: config.catDetectionThreshold || 0.3,
      catSoundThreshold: config.catSoundThreshold || 0.2
    });
    
    // 窗口处理器
    this.windowProcessor = new WindowProcessor({
      interval: config.windowInterval || 1000,
      stateManager: this.stateManager,
      lruCache: this.mewt.image_lru,
      autoStart: false  // 手动控制启动
    });
    
    // VLM 视觉分析管理器
    this.vlmVision = new VLMChannel('vision', {
      enabled: config.vlmEnabled !== false,
      minInterval: config.vlmMinInterval || 15000,
      maxPerMinute: config.vlmMaxPerMinute || 3
    });
    
    // ========== Service Worker 管理器 ==========
    
    // Service Worker 管理器（用于 MediaPipe 资源缓存）
    this.swManager = new ServiceWorkerManager(config.onLog || null);
    
    // ========== 状态管理 ==========
    
    // 稳定状态管理（防抖机制）
    this.state = {
      stable: 'idle',       // 稳定状态
      pending: 'idle',      // 待定状态
      lastStable: 'idle',   // 上一个稳定状态
      changeTime: 0         // 状态变化时间
    };
    
    // 防抖配置
    this.STATE_DEBOUNCE_MS = config.stateDebounceMs || 2000;
    
    // 响应去重
    this.lastResponse = '';
    
    // ========== 最新预测结果 ==========
    
    this.latestPredictions = {
      image: [],
      audio: []
    };
    
    // 最新情绪分析结果
    this.latestEmotionResult = null;
    
    // ========== 外部依赖（由页面注入）==========
    
    // 视频元素引用
    this.videoElement = null;
    
    // ========== 回调函数（由页面注入）==========
    
    this.callbacks = {
      onPredictionUpdate: config.onPredictionUpdate || null,
      onStateChange: config.onStateChange || null,
      onVLMResult: config.onVLMResult || null,
      onLog: config.onLog || null
    };
    
    // ========== DeepMewt 状态 ==========
    
    this.deepMewtEnabled = false;
    
    // ========== 状态变化观察者系统 ==========
    
    this.stateChangeObserverManager = new StateChangeObserverManager();
    
    // 注册默认观察者（按优先级顺序）
    this._initializeObservers();
    
    // ========== 注册 RN 消息处理器 ==========
    
    this._registerRNMessageHandlers();
    
    // ========== 自动注册 Service Worker ==========
    
    // 自动注册 Service Worker（可通过配置禁用）
    if (config.enableServiceWorker !== false) {
      this._initServiceWorker();
    }
  }

  /*
  方法名：初始化Service Worker
  方法简介：异步注册 Service Worker，查询缓存状态，发送加载状态消息到RN。
            添加延迟确保RN消息监听器已就绪。
  业务域关键词：Service Worker注册、资源缓存、异步初始化、缓存状态、加载消息
  */
  async _initServiceWorker() {
    try {
      const success = await this.swManager.register();
      
      if (success) {
        const status = this.swManager.getCacheStatus();
        
        if (this.callbacks.onLog) {
          this.callbacks.onLog(
            `[引擎] Service Worker 就绪，缓存: ${status.cached}/${status.total}`
          );
        }
        
        // 等待3秒确保RN消息监听器已就绪
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // 如果所有资源已缓存，直接发送就绪消息
        if (status.isReady) {
          if (this.callbacks.onLog) {
            this.callbacks.onLog('[引擎] ✅ 所有 MediaPipe 资源已缓存');
          }
          
          // 发送就绪消息到RN
          sendToRN(
            "Alright, let's find some cats!",
            'system',
            'idle',
            { isReady: true, cached: true }
          );
        } else {
          // 资源未缓存，发送加载消息
          if (this.callbacks.onLog) {
            this.callbacks.onLog(
              `[引擎] ⏳ 资源缓存中... ${status.cached}/${status.total}`
            );
          }
          
          // 发送加载中消息到RN
          sendToRN(
            "Loading resources, this may take about a minute...",
            'system',
            'idle',
            { isLoading: true, cached: false }
          );
          
          // 等待资源加载完成（检查缓存状态变化）
          await this._waitForResourcesReady();
          
          // 发送就绪消息到RN
          sendToRN(
            "Alright, let's find some cats!",
            'system',
            'idle',
            { isReady: true, cached: false }
          );
        }
      } else {
        if (this.callbacks.onLog) {
          this.callbacks.onLog('[引擎] Service Worker 未启用或注册失败');
        }
        
        // Service Worker 失败，仍然发送就绪消息（降级处理）
        sendToRN(
          "Alright, let's find some cats!",
          'system',
          'idle',
          { isReady: true, swFailed: true }
        );
      }
    } catch (error) {
      console.error('[引擎] Service Worker 初始化失败:', error);
      if (this.callbacks.onLog) {
        this.callbacks.onLog(`[引擎] Service Worker 初始化失败: ${error.message}`);
      }
      
      // 出错时仍然发送就绪消息（降级处理）
      sendToRN(
        "Alright, let's find some cats!",
        'system',
        'idle',
        { isReady: true, error: true }
      );
    }
  }

  /*
  方法名：等待资源就绪
  方法简介：轮询检查缓存状态，直到所有资源加载完成或超时。
  业务域关键词：资源加载、轮询检查、超时处理
  */
  async _waitForResourcesReady() {
    const maxWaitTime = 120000; // 最长等待2分钟
    const checkInterval = 500; // 每500ms检查一次
    const startTime = Date.now();
    
    return new Promise((resolve) => {
      const checkStatus = () => {
        const status = this.swManager.getCacheStatus();
        const elapsed = Date.now() - startTime;
        
        if (status.isReady) {
          // 资源加载完成
          if (this.callbacks.onLog) {
            this.callbacks.onLog(`[引擎] ✅ 资源加载完成，耗时: ${Math.round(elapsed / 1000)}s`);
          }
          resolve();
        } else if (elapsed >= maxWaitTime) {
          // 超时，放弃等待
          if (this.callbacks.onLog) {
            this.callbacks.onLog('[引擎] ⚠️ 资源加载超时，继续运行');
          }
          resolve();
        } else {
          // 继续等待
          setTimeout(checkStatus, checkInterval);
        }
      };
      
      checkStatus();
    });
  }

  /*
  方法名：初始化观察者
  方法简介：创建并注册所有状态变化观察者，设置优先级和执行顺序。
  业务域关键词：观察者初始化、观察者注册、优先级设置、RN消息观察者、情绪分析观察者
  */
  _initializeObservers() {
    // 1. 日志记录（最高优先级，先记录）
    const loggerObserver = new LoggerObserver();
    this.stateChangeObserverManager.addObserver(loggerObserver, 100);
    
    // 2. RN 状态消息发送（高优先级）
    const rnMessenger = new RNMessengerObserver();
    this.stateChangeObserverManager.addObserver(rnMessenger, 90);
    
    // 3. 音频情绪分析（高优先级，在状态消息之后）
    const audioEmotion = new AudioEmotionObserver();
    this.stateChangeObserverManager.addObserver(audioEmotion, 85);
    
    // 4. VLM 触发（中等优先级）
    const vlmTrigger = new VLMTriggerObserver(
      this.vlmVision,
      () => this.getCurrentFrame()
    );
    this.stateChangeObserverManager.addObserver(vlmTrigger, 50);
    
    // 5. UI 通知（较低优先级，最后通知）
    const uiNotifier = new UINotifierObserver();
    this.stateChangeObserverManager.addObserver(uiNotifier, 10);
  }

  // ========== 核心检测处理方法 ==========

  /*
  方法名：处理图像检测结果
  方法简介：接收 MediaPipe 图像分类结果，存储到最新预测，喂给 Mewt 实例，
            添加到窗口处理器，触发状态更新。
  业务域关键词：图像检测、MediaPipe分类、Mewt数据收集、窗口处理、状态更新
  Param: classifications - MediaPipe 图像分类结果数组
  */
  handleImageResult(classifications) {
    if (!classifications || classifications.length === 0) return;
    
    // 存储最新预测结果
    this.latestPredictions.image = classifications[0].categories;
    
    // 格式化为标准格式
    const predictions = classifications[0].categories.map(cat => ({
      class: cat.categoryName,
      score: cat.score
    }));
    
    // 喂给 Mewt 实例（触发 LRU 更新）
    this.mewt.addImageResult(predictions);
    
    // 添加到窗口处理器
    this.windowProcessor.addImageData(predictions);
    
    // 触发状态更新
    this.updateState();
  }

  /*
  方法名：处理音频检测结果
  方法简介：接收 MediaPipe 音频分类结果和原始音频数据，触发情绪分析并存储结果。
  业务域关键词：音频检测、音频分类、YAMNet、情绪分析、音频特征提取
  Param: result - MediaPipe 音频分类结果
  Param: inputData - 原始音频数据（可选）
  */
  handleAudioResult(result, inputData = null) {
    if (!result || !result[0]) return;
    
    const categories = result[0].classifications[0].categories;
    
    // 存储最新预测结果
    this.latestPredictions.audio = categories;
    
    // 格式化为标准格式
    const predictions = categories.map(cat => ({
      class: cat.categoryName,
      score: cat.score
    }));
    
    // 喂给 Mewt 实例，获取情绪分析结果
    const emotionResponse = this.mewt.addAudioResult(predictions, inputData);
    
    // 如果有情绪分析结果，存储到引擎
    if (emotionResponse) {
      this.latestEmotionResult = emotionResponse;
    }
    
    // 添加到窗口处理器
    this.windowProcessor.addAudioData(predictions);
    
    // 触发状态更新
    this.updateState();
  }

  // ========== 状态判断和更新 ==========

  /*
  方法名：更新检测状态
  方法简介：使用 Mewt 标准方法判断视觉和音频检测状态，应用防抖处理，
            检测状态变化时通过观察者系统触发所有后续操作。
  业务域关键词：状态判断、LRU信任、防抖机制、观察者通知、状态变化事件
  */
  updateState() {
    const context = this.mewt.getFullContext();
    
    // 使用 Mewt 的标准方法 + LRU 信任机制
    let hasVisual = this.mewt.hasVisualCat();
    if (!hasVisual) {
      const recent10 = context.image_lru.recent(10);
      const catCount = recent10.filter(item => item.isCat).length;
      if (catCount > 0) {
        hasVisual = true; // Trust LRU history
      }
    }
    
    const hasAudio = this.mewt.hasCatSound();
    const rawState = this.mewt.determineState(hasVisual, hasAudio);
    
    // 防抖处理
    const now = Date.now();
    if (rawState !== this.state.pending) {
      this.state.pending = rawState;
      this.state.changeTime = now;
    }
    
    // 只在待定状态持续足够时间后更新稳定状态
    if (now - this.state.changeTime >= this.STATE_DEBOUNCE_MS) {
      this.state.stable = this.state.pending;
      
      // 检测状态变化 - 通过观察者系统处理
      if (this.state.stable !== this.state.lastStable) {
        this._notifyStateChange(this.state.stable, this.state.lastStable, hasVisual, hasAudio);
        this.state.lastStable = this.state.stable;
      }
    }
    
    // 获取 VLM 文本（如果有锁定的结果）
    const vlmText = this.vlmVision.getText();
    
    // 最终文本（VLM 优先，否则使用统一配置的文案）
    const finalText = vlmText || STATE_MESSAGES[this.state.stable];
    
    // 响应去重
    if (finalText && finalText !== this.lastResponse) {
      this.lastResponse = finalText;
      
      // 准备完整的更新数据
      const updateData = {
        image: this.latestPredictions.image,
        audio: this.latestPredictions.audio,
        state: this.state.stable,
        hasVisual: hasVisual,
        hasAudio: hasAudio,
        text: finalText,
        vlmText: vlmText,
        vlmLocked: !!vlmText,
        isFocusing: context.is_now_focusing_cat
      };
      
      // 通知 UI 层
      if (this.callbacks.onPredictionUpdate) {
        this.callbacks.onPredictionUpdate(updateData);
      }
    }
  }

  // ========== 状态变化通知 ==========

  /*
  方法名：通知状态变化
  方法简介：构建状态变化事件对象，包含情绪数据，通过观察者管理器通知所有已注册观察者。
  业务域关键词：状态变化通知、观察者事件、事件分发、情绪数据传递
  Param: newState - 新状态
  Param: oldState - 旧状态
  Param: hasVisual - 是否有视觉检测
  Param: hasAudio - 是否有音频检测
  */
  _notifyStateChange(newState, oldState, hasVisual, hasAudio) {
    // 获取 VLM 文本
    const vlmText = this.vlmVision.getText();
    
    // 构建状态变化事件对象
    const event = {
      newState,
      oldState,
      timestamp: Date.now(),
      vlmText,
      emotionResult: this.latestEmotionResult, // 传递情绪分析结果
      metadata: {
        hasVisual,
        hasAudio,
        isFocusing: this.mewt.getFullContext().is_now_focusing_cat
      },
      // 传递回调函数供观察者使用
      onVLMResult: this.callbacks.onVLMResult,
      onLog: this.callbacks.onLog,
      onStateChange: this.callbacks.onStateChange
    };
    
    // 通知所有观察者
    this.stateChangeObserverManager.notify(event);
    
    // 清空情绪结果（避免重复发送）
    this.latestEmotionResult = null;
  }

  // ========== 工具方法 ==========

  /*
  方法名：获取当前视频帧
  方法简介：从视频元素中提取当前帧，使用高 DPI Canvas 渲染，
            返回高质量 JPEG 格式的 base64 图像数据。
  业务域关键词：视频截图、Canvas渲染、高DPI支持、图像质量、base64编码
  */
  getCurrentFrame() {
    if (!this.videoElement) {
      console.warn('MewtEngine: 视频元素未设置');
      return null;
    }
    
    const video = this.videoElement;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    // 获取设备像素比，支持高 DPI 显示
    const devicePixelRatio = window.devicePixelRatio || 1;
    
    // 设置 Canvas 实际尺寸
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    // 设置 Canvas 显示尺寸
    canvas.style.width = video.videoWidth / devicePixelRatio + 'px';
    canvas.style.height = video.videoHeight / devicePixelRatio + 'px';
    
    // 缩放上下文以匹配设备像素比
    ctx.scale(devicePixelRatio, devicePixelRatio);
    
    // 启用图像平滑和高质量渲染
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    // 绘制视频帧
    ctx.drawImage(video, 0, 0, video.videoWidth / devicePixelRatio, video.videoHeight / devicePixelRatio);
    
    // 返回高质量 JPEG（质量 0.95）
    return canvas.toDataURL('image/jpeg', 0.95);
  }

  /*
  方法名：设置视频元素
  方法简介：注入视频元素引用供引擎使用，用于截图等操作。
  业务域关键词：视频元素、依赖注入、视频引用
  Param: videoElement - HTML video 元素
  */
  setVideoElement(videoElement) {
    this.videoElement = videoElement;
  }

  /*
  方法名：获取完整上下文
  方法简介：返回 Mewt 实例的完整上下文数据，包含 LRU 缓存、窗口数据等。
  业务域关键词：上下文数据、LRU缓存、窗口状态、检测历史
  */
  getFullContext() {
    return this.mewt.getFullContext();
  }

  /*
  方法名：获取VLM状态
  方法简介：返回 VLM 管理器的当前状态，包含处理状态、调用次数、锁定信息等。
  业务域关键词：VLM状态、处理状态、速率限制、锁定数据
  */
  getVLMStatus() {
    return {
      isProcessing: this.vlmVision.isProcessing,
      callsInLastMinute: this.vlmVision.rateLimiter.callsInLastMinute.length,
      lastCallTime: this.vlmVision.rateLimiter.lastCallTime,
      lockRemaining: Math.max(0, this.vlmVision.lock.until - Date.now()),
      lockText: this.vlmVision.lock.text,
      currentText: this.vlmVision.getText()
    };
  }

  /*
  方法名：获取缓存状态
  方法简介：返回 Service Worker 的缓存状态信息。
  业务域关键词：缓存状态、资源缓存、MediaPipe缓存
  */
  getCacheStatus() {
    return this.swManager.getCacheStatus();
  }

  /*
  方法名：获取Service Worker详细状态
  方法简介：返回 Service Worker 的详细状态，用于调试和监控。
  业务域关键词：Service Worker状态、调试信息、缓存监控
  */
  getSWDetailedStatus() {
    return this.swManager.getDetailedStatus();
  }

  /*
  方法名：清除缓存
  方法简介：清除所有 Service Worker 缓存，用于调试或强制更新。
  业务域关键词：缓存清除、强制更新、调试工具
  */
  async clearCache() {
    return await this.swManager.clearCache();
  }

  /*
  方法名：获取当前状态
  方法简介：返回引擎的当前稳定状态和相关状态信息。
  业务域关键词：当前状态、稳定状态、待定状态、状态信息
  */
  getCurrentState() {
    return {
      stable: this.state.stable,
      pending: this.state.pending,
      lastStable: this.state.lastStable,
      timeSinceChange: Date.now() - this.state.changeTime
    };
  }

  // ========== RN 消息处理 ==========

  /*
  方法名：注册RN消息处理器
  方法简介：设置 RN 消息接收器的事件监听，处理 DeepMewt 切换、拍照请求和可见性变化，
            内部私有方法。
  业务域关键词：RN消息、事件监听、DeepMewt、拍照请求、可见性变化、消息处理
  */
  _registerRNMessageHandlers() {
    // DeepMewt 模式切换
    rnReceiver.on('deep_mewt_toggle', (data) => {
      this.handleRNMessage({
        type: 'deep_mewt_toggle',
        ...data
      });
    });
    
    // 拍照请求
    rnReceiver.on('take_photo', (data) => {
      this.handleRNMessage({
        type: 'take_photo',
        ...data
      });
    });
    
    // 页面可见性变化（锁屏/解锁）
    rnReceiver.on('visibility_change', (data) => {
      this.handleRNMessage({
        type: 'visibility_change',
        ...data
      });
    });
  }

  /*
  方法名：处理RN消息
  方法简介：根据消息类型执行对应操作，如 DeepMewt 模式切换、拍照等，
            并发送响应消息回 RN。
  业务域关键词：RN消息处理、DeepMewt切换、拍照处理、消息响应、状态确认
  Param: message - RN 消息对象，包含 type 和相关数据
  */
  handleRNMessage(message) {
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[RN Message] 收到消息: ${message.type}`);
    }
    
    switch (message.type) {
      case 'deep_mewt_toggle':
        this._handleDeepMewtToggle(message);
        break;
        
      case 'take_photo':
        this._handleTakePhoto(message);
        break;
        
      case 'visibility_change':
        this._handleVisibilityChange(message);
        break;
        
      default:
        console.warn('MewtEngine: 未知的 RN 消息类型', message.type);
    }
  }

  /*
  方法名：处理DeepMewt切换
  方法简介：更新 DeepMewt 状态，记录日志，发送状态确认消息回 RN，内部私有方法。
  业务域关键词：DeepMewt、状态切换、确认消息、状态记录
  Param: data - 包含 enabled 字段的数据对象
  */
  _handleDeepMewtToggle(data) {
    const previousState = this.deepMewtEnabled;
    this.deepMewtEnabled = data.enabled;
    
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[DeepMewt] 状态切换: ${previousState} → ${this.deepMewtEnabled}`);
    }
    
    // 发送确认消息到 RN（使用统一配置）
    const message = this.deepMewtEnabled ? SYSTEM_MESSAGES.deepMewtEnabled : SYSTEM_MESSAGES.deepMewtDisabled;
    sendToRN(
      message,
      'system',
      this.state.stable,
      {
        enabled: this.deepMewtEnabled,
        timestamp: Date.now(),
        previousState: previousState
      }
    );
  }

  /*
  方法名：处理拍照请求
  方法简介：获取当前视频帧截图，记录日志，将图像数据发送回 RN，内部私有方法。
  业务域关键词：拍照、视频截图、图像发送、RN响应
  Param: data - 拍照请求数据对象
  */
  _handleTakePhoto(data) {
    if (this.callbacks.onLog) {
      this.callbacks.onLog('[Photo] 收到拍照请求');
    }
    
    // 获取当前帧截图
    const imageData = this.getCurrentFrame();
    
    if (!imageData) {
      console.error('MewtEngine: 无法获取视频帧');
      return;
    }
    
    const imageSizeKB = (imageData.length / 1024).toFixed(2);
    
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[Photo] 截图完成，大小: ${imageSizeKB} KB`);
    }
    
    // 发送截图回 RN（使用统一配置）
    sendToRN(
      SYSTEM_MESSAGES.photoTaken,
      'photo',
      this.state.stable,
      {
        imageData: imageData,
        timestamp: Date.now(),
        videoSize: this.videoElement ? {
          width: this.videoElement.videoWidth,
          height: this.videoElement.videoHeight
        } : null
      }
    );
  }

  /*
  方法名：处理可见性变化
  方法简介：处理页面可见性变化（锁屏/解锁），当页面重新可见时确保视频流正常运行。
  业务域关键词：可见性变化、锁屏恢复、视频流检查、页面生命周期
  Param: data - 包含 visible 字段的数据对象（true=可见，false=不可见）
  */
  _handleVisibilityChange(data) {
    const isVisible = data.visible;
    
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[Visibility] 页面可见性变化: ${isVisible ? '可见' : '不可见'}`);
    }
    
    // 当页面变为可见时，检查视频流状态
    if (isVisible && this.videoElement) {
      // 检查视频流是否活跃
      const stream = this.videoElement.srcObject;
      const hasActiveTrack = stream && stream.getVideoTracks().some(track => track.readyState === 'live');
      
      if (!hasActiveTrack) {
        // 视频流已断开，需要重新请求
        if (this.callbacks.onLog) {
          this.callbacks.onLog('[Visibility] 检测到视频流已断开，重新启动摄像头...');
        }
        
        // 调用全局的 restartCamera 函数（在 play.html 中定义）
        if (window.restartCamera) {
          window.restartCamera().then(success => {
            if (success) {
              if (this.callbacks.onLog) {
                this.callbacks.onLog('[Visibility] ✅ 摄像头重启成功');
              }
            } else {
              console.error('[Visibility] ❌ 摄像头重启失败');
              if (this.callbacks.onLog) {
                this.callbacks.onLog('[Visibility] ❌ 摄像头重启失败');
              }
            }
          }).catch(err => {
            console.error('[Visibility] 摄像头重启出错:', err);
            if (this.callbacks.onLog) {
              this.callbacks.onLog(`[Visibility] 摄像头重启出错: ${err.message}`);
            }
          });
        } else {
          console.warn('[Visibility] window.restartCamera 函数不可用');
        }
      } else {
        // 视频流活跃，检查是否正在播放
        const isPlaying = this.videoElement.currentTime > 0 
          && !this.videoElement.paused 
          && !this.videoElement.ended 
          && this.videoElement.readyState > 2;
        
        if (!isPlaying) {
          // 尝试恢复播放
          if (this.callbacks.onLog) {
            this.callbacks.onLog('[Visibility] 视频流活跃但未播放，尝试恢复...');
          }
          
          this.videoElement.play().catch(err => {
            console.error('[Visibility] 视频流恢复失败:', err);
            if (this.callbacks.onLog) {
              this.callbacks.onLog(`[Visibility] 视频流恢复失败: ${err.message}`);
            }
          });
        } else {
          if (this.callbacks.onLog) {
            this.callbacks.onLog('[Visibility] 视频流正常运行');
          }
        }
      }
    }
  }

  // ========== 生命周期方法 ==========

  /*
  方法名：销毁引擎
  方法简介：清理所有资源，停止窗口处理器，重置状态，取消事件监听。
  业务域关键词：资源清理、引擎销毁、内存释放、事件取消
  */
  destroy() {
    // 停止窗口处理器
    this.windowProcessor.stopAutoProcessing();
    
    // 清理状态
    this.state = {
      stable: 'idle',
      pending: 'idle',
      lastStable: 'idle',
      changeTime: 0
    };
    
    // 清理预测结果
    this.latestPredictions = {
      image: [],
      audio: []
    };
    
    // 清空回调
    this.callbacks = {
      onPredictionUpdate: null,
      onStateChange: null,
      onVLMResult: null,
      onLog: null
    };
    
    // 清空视频元素引用
    this.videoElement = null;
    
    console.log('MewtEngine: 引擎已销毁');
  }
}

export default MewtEngine;
