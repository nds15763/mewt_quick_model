/**
 * RN Bridge - React Native通讯桥接
 * 
 * 功能：WebView向RN发送检测结果文案
 * 
 * 消息格式：
 * {
 *   type: 'chat_message' | 'status_update' | 'debug_log',
 *   text: '那里有只小猫',
 *   source: 'state' | 'vlm' | 'photo' | 'system',
 *   state: 'idle' | 'cat_visual' | 'cat_audio' | 'cat_both',
 *   timestamp: 1699999999999,
 *   metadata: { hasCat, hasVisual, hasAudio, confidence?, vlmLocked? }
 * }
 * 
 * 最新改动 (2025-10-21):
 * - type 字段直接区分消息类别（chat_message/status_update/debug_log）
 * - 根据 source、state、metadata 自动决定 type 值
 * - 奥卡姆剃刀原则：简化消息分类逻辑
 */

/**
 * 决定消息类型
 * @param {string} source - 消息来源
 * @param {string} state - 当前状态
 * @param {object} metadata - 元数据
 * @returns {string} - 'chat_message' | 'status_update'
 */
function determineMessageType(source, state, metadata) {
  // 系统消息 - 根据showInChat决定是否显示
  // 默认显示(chat_message)，除非metadata.showInChat明确设置为false
  if (source === 'system') {
    return metadata?.showInChat !== false ? 'chat_message' : 'status_update';
  }
  
  // 状态机 - 聊天消息
  if (source === 'state' && state !== 'idle') {
    return 'chat_message';
  }
  
  // VLM - 聊天消息（已锁定）
  if (source === 'vlm' && metadata?.vlmLocked === true) {
    return 'chat_message';
  }
  
  // 拍照消息
  if (source === 'photo') {
    return 'chat_message';
  }
  
  // 其他都是状态消息
  return 'status_update';
}

function sendToRN(text, source, state, metadata = {}) {
  const messageType = determineMessageType(source, state, metadata);
  
  const message = {
    type: messageType,
    text,
    source,        // 'state' | 'vlm' | 'photo' | 'system'
    state,         // 当前状态
    timestamp: Date.now(),
    metadata       // 额外信息
  };
  
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage(JSON.stringify(message));
  }
  console.log('[→ RN]', message);
}

export default sendToRN;
