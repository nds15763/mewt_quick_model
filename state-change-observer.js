/**
 * 业务域：状态变化观察者系统
 * 业务域简述：使用观察者模式统一管理猫咪检测状态变化后的所有后续操作，
 *           包括 RN 消息发送、VLM 触发、日志记录、UI 通知等，提供可扩展的状态响应机制。
 * 
 * 核心方法清单：
 * - 通知所有观察者 notify @state-change-observer.js#L36-L44
 * - 添加观察者 addObserver @state-change-observer.js#L53-L62
 * - 移除观察者 removeObserver @state-change-observer.js#L71-L82
 * - 发送RN消息 RNMessengerObserver.notify @state-change-observer.js#L117-L147
 * - 触发VLM分析 VLMTriggerObserver.notify @state-change-observer.js#L189-L226
 * - 记录状态日志 LoggerObserver.notify @state-change-observer.js#L259-L266
 * - 通知UI更新 UINotifierObserver.notify @state-change-observer.js#L299-L306
 */

import sendToRN from './rn-bridge.js';

/*
方法名：状态变化观察者管理器
方法简介：管理所有状态变化观察者，提供注册、移除和通知功能的观察者模式核心管理器。
业务域关键词：观察者管理、状态变化、观察者注册、事件通知、观察者模式
*/
export class StateChangeObserverManager {
  constructor() {
    this.observers = [];
  }

  /*
  方法名：通知所有观察者
  方法简介：遍历所有已注册观察者，依次调用其 notify 方法传递状态变化事件。
  业务域关键词：事件通知、观察者调用、状态广播、事件分发
  Param: event - 状态变化事件对象，包含新旧状态、文本、元数据等信息
  */
  notify(event) {
    this.observers.forEach(observer => {
      try {
        observer.notify(event);
      } catch (error) {
        console.error(`Observer ${observer.constructor.name} failed:`, error);
      }
    });
  }

  /*
  方法名：添加观察者
  方法简介：将新的观察者注册到管理器，支持可选的优先级控制观察者执行顺序。
  业务域关键词：观察者注册、优先级排序、观察者添加
  Param: observer - 观察者实例，需实现 notify 方法
  Param: priority - 可选优先级，数字越大越先执行，默认 0
  */
  addObserver(observer, priority = 0) {
    observer.priority = priority;
    this.observers.push(observer);
    // 按优先级排序（高优先级先执行）
    this.observers.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  /*
  方法名：移除观察者
  方法简介：从管理器中注销指定观察者，停止接收状态变化通知。
  业务域关键词：观察者注销、观察者移除、取消订阅
  Param: observer - 要移除的观察者实例
  Returns: 是否成功移除
  */
  removeObserver(observer) {
    const index = this.observers.indexOf(observer);
    if (index > -1) {
      this.observers.splice(index, 1);
      return true;
    }
    return false;
  }
}

/*
方法名：状态变化观察者基类
方法简介：定义观察者接口规范，所有具体观察者必须继承并实现 notify 方法。
业务域关键词：观察者基类、接口定义、抽象类、观察者规范
*/
export class StateChangeObserver {
  /*
  方法名：观察者通知方法
  方法简介：接收状态变化事件的抽象方法，由子类实现具体响应逻辑。
  业务域关键词：事件响应、观察者回调、状态处理
  Param: event - 状态变化事件对象
  */
  notify(event) {
    throw new Error('StateChangeObserver.notify() must be implemented by subclass');
  }
}

// ========== 具体观察者实现 ==========

/*
方法名：RN消息发送观察者
方法简介：监听状态变化并自动发送格式化消息到 React Native 应用的观察者。
业务域关键词：RN消息、消息发送、状态通知、跨平台通信、React Native
*/
export class RNMessengerObserver extends StateChangeObserver {
  constructor() {
    super();
    // 状态对应的默认文案
    this.stateResponses = {
      'idle': '观察中...',
      'cat_visual': '那里有只小猫',
      'cat_audio': '诶？我好像听到小猫叫了',
      'cat_both': '哦！是个小猫'
    };
  }

  /*
  方法名：发送RN消息
  方法简介：根据状态变化事件生成并发送消息到 RN，包含状态文本和完整元数据。
  业务域关键词：RN消息发送、状态文本、消息格式化、跨平台消息
  Param: event - 状态变化事件对象
  */
  notify(event) {
    const { newState, oldState, text, vlmText, metadata = {} } = event;
    
    // 使用 VLM 文本或默认文本
    const finalText = vlmText || text || this.stateResponses[newState];
    
    if (!finalText) return;
    
    // 构建完整元数据
    const fullMetadata = {
      ...metadata,
      oldState,
      hasVisual: metadata.hasVisual || false,
      hasAudio: metadata.hasAudio || false,
      vlmLocked: !!vlmText,
      timestamp: event.timestamp || Date.now()
    };
    
    // 发送到 RN
    sendToRN(finalText, 'state', newState, fullMetadata);
  }
}

/*
方法名：VLM触发观察者
方法简介：监听状态变化并在适当时机触发 VLM 视觉分析的观察者。
业务域关键词：VLM触发、视觉分析、猫咪确认、图像分析、VLM管理
*/
export class VLMTriggerObserver extends StateChangeObserver {
  /*
  方法名：初始化VLM触发器
  方法简介：设置 VLM 管理器和视频帧获取函数的引用。
  业务域关键词：VLM初始化、视频帧、依赖注入
  Param: vlmManager - VLM 管理器实例
  Param: getFrameFn - 获取当前视频帧的函数
  */
  constructor(vlmManager, getFrameFn) {
    super();
    this.vlmManager = vlmManager;
    this.getFrame = getFrameFn;
  }

  /*
  方法名：触发VLM分析
  方法简介：检测状态变化是否涉及视觉检测，在猫咪出现或消失时触发 VLM 确认。
  业务域关键词：VLM分析、视觉确认、猫咪检测、状态触发
  Param: event - 状态变化事件对象
  */
  async notify(event) {
    const { newState, oldState, onVLMResult, onLog } = event;
    
    // 判断是否涉及视觉检测
    const hasVisual = newState === 'cat_visual' || newState === 'cat_both';
    const hadVisual = oldState === 'cat_visual' || oldState === 'cat_both';
    
    if (hasVisual && !hadVisual) {
      // 开始看到猫 - 调用 VLM 确认
      if (onLog) {
        onLog('[VLM Trigger] 检测到猫，调用VLM确认');
      }
      const frame = this.getFrame();
      if (frame) {
        const result = await this.vlmManager.analyze({ image: frame });
        if (result && onVLMResult) {
          onVLMResult(result);
        }
      }
    } else if (!hasVisual && hadVisual) {
      // 丢失猫 - 调用 VLM 确认
      if (onLog) {
        onLog('[VLM Trigger] 丢失猫，调用VLM确认');
      }
      const frame = this.getFrame();
      if (frame) {
        const result = await this.vlmManager.analyze({ image: frame });
        if (result && onVLMResult) {
          onVLMResult(result);
        }
      }
    }
  }
}

/*
方法名：日志记录观察者
方法简介：监听状态变化并记录详细日志的观察者，用于调试和追踪。
业务域关键词：日志记录、状态日志、调试信息、日志追踪
*/
export class LoggerObserver extends StateChangeObserver {
  /*
  方法名：记录状态日志
  方法简介：记录状态变化的详细信息，包括新旧状态、时间戳等调试数据。
  业务域关键词：日志输出、状态记录、调试日志
  Param: event - 状态变化事件对象
  */
  notify(event) {
    const { newState, oldState, onLog } = event;
    if (onLog) {
      onLog(`[State Change] ${oldState} → ${newState}`);
    }
  }
}

/*
方法名：UI通知观察者
方法简介：监听状态变化并通知 UI 层更新显示的观察者，支持页面实时反馈。
业务域关键词：UI通知、界面更新、状态同步、UI回调
*/
export class UINotifierObserver extends StateChangeObserver {
  /*
  方法名：通知UI更新
  方法简介：调用回调函数通知 UI 层状态已变化，触发界面刷新。
  业务域关键词：UI回调、界面刷新、状态通知
  Param: event - 状态变化事件对象
  */
  notify(event) {
    const { newState, oldState, onStateChange } = event;
    if (onStateChange) {
      onStateChange(newState, oldState);
    }
  }
}
