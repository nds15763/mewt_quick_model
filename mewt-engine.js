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

/**
 * Mewt 检测引擎类
 * 统一管理音视频检测、状态判断、VLM 分析、RN 通讯的核心引擎
 */
export class MewtEngine {
  /*
  方法名：初始化引擎
  方法简介：创建 MewtEngine 实例，初始化所有子模块（Mewt、StateManager、VLM等），
            设置状态管理和回调函数，注册 RN 消息处理器。
  业务域关键词：引擎初始化、Mewt实例、状态管理器、VLM管理、窗口处理器、RN消息、回调注册
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
    
    // ========== 注册 RN 消息处理器 ==========
    
    this._registerRNMessageHandlers();
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
  方法简介：接收 MediaPipe 音频分类结果和原始音频数据，存储到最新预测，
            喂给 Mewt 实例，添加到窗口处理器，触发状态更新。
  业务域关键词：音频检测、音频分类、YAMNet、Mewt音频处理、窗口聚合
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
    
    // 喂给 Mewt 实例
    this.mewt.addAudioResult(predictions, inputData);
    
    // 添加到窗口处理器
    this.windowProcessor.addAudioData(predictions);
    
    // 触发状态更新
    this.updateState();
  }

  // ========== 状态判断和更新 ==========

  /*
  方法名：更新检测状态
  方法简介：使用 Mewt 标准方法判断视觉和音频检测状态，结合 LRU 信任机制，
            应用防抖处理，生成最终响应文本并通知 UI 层。
  业务域关键词：状态判断、LRU信任、防抖机制、VLM文本、响应生成、UI回调
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
      
      // 检测状态变化
      if (this.state.stable !== this.state.lastStable) {
        this.handleStateChange(this.state.stable, this.state.lastStable);
        this.state.lastStable = this.state.stable;
      }
    }
    
    // 获取 VLM 文本（如果有锁定的结果）
    const vlmText = this.vlmVision.getText();
    
    // 默认状态响应
    const stateResponses = {
      'idle': '观察中...',
      'cat_visual': '那里有只小猫',
      'cat_audio': '诶？我好像听到小猫叫了',
      'cat_both': '哦！是个小猫'
    };
    
    // 最终文本（VLM 优先）
    const finalText = vlmText || stateResponses[this.state.stable];
    
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

  // ========== 状态变化处理 ==========

  /*
  方法名：处理状态变化
  方法简介：当稳定状态发生变化时触发，判断是否需要调用 VLM 进行视觉确认，
            并通知 UI 层状态变化事件。
  业务域关键词：状态变化、VLM触发、视觉确认、状态转换、UI通知
  Param: newState - 新状态
  Param: oldState - 旧状态
  */
  async handleStateChange(newState, oldState) {
    // 记录日志
    if (this.callbacks.onLog) {
      this.callbacks.onLog(`[State Change] ${oldState} → ${newState}`);
    }
    
    // 通知 UI 层
    if (this.callbacks.onStateChange) {
      this.callbacks.onStateChange(newState, oldState);
    }
    
    // 判断是否需要触发 VLM
    const hasVisual = newState === 'cat_visual' || newState === 'cat_both';
    const hadVisual = oldState === 'cat_visual' || oldState === 'cat_both';
    
    if (hasVisual && !hadVisual) {
      // 开始看到猫 - 调用 VLM 确认
      if (this.callbacks.onLog) {
        this.callbacks.onLog('[VLM Trigger] 检测到猫，调用VLM确认');
      }
      const frame = this.getCurrentFrame();
      if (frame) {
        const result = await this.vlmVision.analyze({ image: frame });
        if (result && this.callbacks.onVLMResult) {
          this.callbacks.onVLMResult(result);
        }
      }
    } else if (!hasVisual && hadVisual) {
      // 丢失猫 - 调用 VLM 确认
      if (this.callbacks.onLog) {
        this.callbacks.onLog('[VLM Trigger] 丢失猫，调用VLM确认');
      }
      const frame = this.getCurrentFrame();
      if (frame) {
        const result = await this.vlmVision.analyze({ image: frame });
        if (result && this.callbacks.onVLMResult) {
          this.callbacks.onVLMResult(result);
        }
      }
    }
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
  方法简介：设置 RN 消息接收器的事件监听，处理 DeepMewt 切换和拍照请求，
            内部私有方法。
  业务域关键词：RN消息、事件监听、DeepMewt、拍照请求、消息处理
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
    
    // 发送确认消息到 RN
    sendToRN(
      `DeepMewt模式已${this.deepMewtEnabled ? '启用' : '禁用'}`,
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
    
    // 发送截图回 RN
    sendToRN(
      '照片已拍摄',
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
