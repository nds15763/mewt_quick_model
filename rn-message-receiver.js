/**
 * RN Message Receiver - 统一接收 RN → WebView 消息
 * 
 * 上行消息格式 (RN → WebView):
 * - { type: 'take_photo', timestamp }
 * - { type: 'deep_mewt_toggle', enabled }
 * 
 * 使用方式:
 * ```
 * import rnReceiver from './rn-message-receiver.js';
 * 
 * rnReceiver
 *   .on('take_photo', (data) => { ... })
 *   .on('deep_mewt_toggle', (data) => { ... });
 * ```
 * 
 * 设计原则: DRY - Don't Repeat Yourself
 * - 消息监听逻辑只写一次
 * - play.html 和 debug.html 共享相同代码
 * - 自动兼容 iOS/Android 平台差异
 */
class RNMessageReceiver {
  constructor() {
    this.handlers = {};
    this.setupListener();
    console.log('[RN Receiver] Initialized');
  }
  
  /**
   * 注册消息处理器
   * @param {string} messageType - 消息类型 ('take_photo' | 'deep_mewt_toggle')
   * @param {Function} handler - 处理函数
   * @returns {RNMessageReceiver} - 支持链式调用
   */
  on(messageType, handler) {
    this.handlers[messageType] = handler;
    console.log(`[RN Receiver] Registered handler for: ${messageType}`);
    return this; // 链式调用
  }
  
  /**
   * 设置消息监听器 - 兼容 iOS/Android
   */
  setupListener() {
    const handleMessage = (event) => {
      try {
        // event.data 可能是字符串或已解析的对象
        const data = typeof event.data === 'string' 
          ? JSON.parse(event.data) 
          : event.data;
        
        console.log('[← RN]', data);
        
        // 查找并执行对应的处理器
        const handler = this.handlers[data.type];
        if (handler) {
          handler(data);
        } else {
          console.warn(`[RN Receiver] No handler for message type: ${data.type}`);
        }
      } catch (e) {
        console.error('[RN Receiver] Error processing message:', e);
      }
    };
    
    // 同时监听 window 和 document - 兼容不同平台
    // iOS: 通常使用 window.addEventListener
    // Android: 可能使用 document.addEventListener
    window.addEventListener('message', handleMessage);
    document.addEventListener('message', handleMessage);
    
    console.log('[RN Receiver] Message listeners attached (window + document)');
  }
}

// 导出单例
export default new RNMessageReceiver();
