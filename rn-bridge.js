/**
 * RN Bridge - React Native通讯桥接
 * 
 * 功能：WebView向RN发送检测结果文案
 * 
 * 消息格式：
 * {
 *   type: 'text_update',
 *   text: '那里有只小猫',
 *   source: 'state' | 'vlm' | 'emotion',
 *   state: 'idle' | 'cat_visual' | 'cat_audio' | 'cat_both',
 *   timestamp: 1699999999999,
 *   metadata: { hasCat, hasVisual, hasAudio, confidence?, vlmLocked? }
 * }
 * 
 * 最新改动 (2025-10-08):
 * - 支持完整消息格式（包含type、source、state、metadata）
 * - 极简设计：单一函数，4个参数
 */
function sendToRN(text, source, state, metadata = {}) {
  const message = {
    type: 'text_update',
    text,
    source,        // 'state' | 'vlm' | 'emotion'
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
