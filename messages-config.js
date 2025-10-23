/**
 * 统一消息文案配置
 * 
 * DRY 原则 - 所有文案集中在此管理，避免重复定义
 * 
 * 使用方式:
 * import { STATE_MESSAGES, AUDIO_MESSAGES, SYSTEM_MESSAGES } from './messages-config.js';
 */

/**
 * 状态机消息文案
 * 用于 state-change-observer.js 中的 RNMessengerObserver
 */
export const STATE_MESSAGES = {
  idle: '观察中...',
  cat_visual: '那里有只小猫',
  cat_audio: null,  // 音频消息由 AudioEmotionObserver 单独处理
  cat_both: '那里有只小猫'
};

/**
 * 音频检测消息文案
 * 用于 state-change-observer.js 中的 AudioEmotionObserver
 */
export const AUDIO_MESSAGES = {
  detected: '猫叫:检测到猫叫声',
  // 具体情绪文案格式: '猫叫:{icon} {title}'
  // 情绪数据由 emotions.js 提供
};

/**
 * 系统消息文案
 * 用于 mewt-engine.js 中的系统操作反馈
 */
export const SYSTEM_MESSAGES = {
  deepMewtEnabled: 'DeepMewt模式已启用',
  deepMewtDisabled: 'DeepMewt模式已禁用',
  photoTaken: '照片已拍摄'
};
