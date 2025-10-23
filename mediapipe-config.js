/**
 * MediaPipe 资源集中配置
 * 所有 MediaPipe 相关的 URL 在这里统一管理
 * 
 * 业务域：MediaPipe 资源管理
 * 业务域简述：集中管理所有 MediaPipe 相关资源的 URL 配置，
 *           为 Service Worker 缓存和页面加载提供统一的资源地址。
 */

// WASM Runtime URLs
export const WASM_URLS = {
  audio: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-audio@0.10.8/wasm',
  vision: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.8/wasm'
};

// 模型文件 URLs
export const MODEL_URLS = {
  yamnet: 'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite',
  efficientnet: 'https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite'
};

// 需要缓存的所有资源（Service Worker使用）
// 注意：WASM 内部文件会自动被浏览器加载和缓存
export const CACHEABLE_RESOURCES = [
  // 模型文件（最大的资源，优先缓存）
  MODEL_URLS.yamnet,
  MODEL_URLS.efficientnet,
  
  // WASM 文件会在运行时自动加载，这里列出主要的JS文件
  // 实际的 .wasm 文件会由浏览器自动请求并被 Service Worker 拦截
];

// Service Worker 配置
export const SW_CONFIG = {
  cacheName: 'mediapipe-cache-v1',
  scope: '/',
  enabled: true,
  // 缓存策略：Cache First（优先使用缓存）
  strategy: 'cache-first'
};

// MediaPipe 资源识别规则（用于 Service Worker 拦截判断）
export const MEDIAPIPE_URL_PATTERNS = [
  'mediapipe-models',
  'tasks-audio',
  'tasks-vision',
  'wasm'
];

/**
 * 检查 URL 是否为 MediaPipe 资源
 * @param {string} url - 要检查的 URL
 * @returns {boolean} 是否为 MediaPipe 资源
 */
export function isMediaPipeResource(url) {
  return MEDIAPIPE_URL_PATTERNS.some(pattern => url.includes(pattern));
}
