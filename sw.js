/**
 * MediaPipe Service Worker
 * 使用集中配置实现智能缓存策略
 * 
 * 业务域：离线缓存和资源加速
 * 业务域简述：拦截 MediaPipe 相关资源请求，实现 Cache First 策略，
 *           大幅提升二次加载速度，支持离线使用。
 */

// Service Worker 中无法使用 ES6 import，需要动态导入或内联配置
// 为了避免跨域问题，这里内联关键配置

const CACHE_NAME = 'mediapipe-cache-v1';

// MediaPipe 资源识别模式
const MEDIAPIPE_PATTERNS = [
  'mediapipe-models',
  'tasks-audio',
  'tasks-vision',
  'wasm',
  'tflite'
];

// 需要预缓存的核心资源
const CORE_RESOURCES = [
  'https://storage.googleapis.com/mediapipe-models/audio_classifier/yamnet/float32/1/yamnet.tflite',
  'https://storage.googleapis.com/mediapipe-models/image_classifier/efficientnet_lite0/float32/1/efficientnet_lite0.tflite'
];

/**
 * 检查 URL 是否为 MediaPipe 资源
 */
function isMediaPipeResource(url) {
  return MEDIAPIPE_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * 安装事件：预缓存核心资源
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Service Worker...');
  
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        console.log('[SW] Cache opened:', CACHE_NAME);
        
        // 渐进式缓存，失败不阻止安装
        const results = await Promise.allSettled(
          CORE_RESOURCES.map(async (url) => {
            try {
              await cache.add(url);
              console.log('[SW] ✅ Cached:', url);
            } catch (error) {
              console.warn('[SW] ⚠️ Failed to cache:', url, error.message);
            }
          })
        );
        
        const successCount = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[SW] Pre-cached ${successCount}/${CORE_RESOURCES.length} resources`);
        
        // 立即激活，不等待旧 SW
        await self.skipWaiting();
        console.log('[SW] Installation complete, skipping waiting');
        
      } catch (error) {
        console.error('[SW] Installation failed:', error);
        throw error;
      }
    })()
  );
});

/**
 * 激活事件：清理旧缓存
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Service Worker...');
  
  event.waitUntil(
    (async () => {
      try {
        // 清理旧版本缓存
        const cacheNames = await caches.keys();
        console.log('[SW] Found caches:', cacheNames);
        
        await Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== CACHE_NAME) {
              console.log('[SW] Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
        
        // 立即接管所有页面
        await self.clients.claim();
        console.log('[SW] Activation complete, claimed clients');
        
      } catch (error) {
        console.error('[SW] Activation failed:', error);
      }
    })()
  );
});

/**
 * Fetch 事件：拦截网络请求，实现 Cache First 策略
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = request.url;
  
  // 只处理 MediaPipe 相关资源
  if (!isMediaPipeResource(url)) {
    // 其他请求直接放行
    return;
  }
  
  // Cache First 策略：优先使用缓存
  event.respondWith(
    (async () => {
      try {
        // 1. 先查缓存
        const cachedResponse = await caches.match(request);
        
        if (cachedResponse) {
          console.log('[SW] 💾 Cache HIT:', url);
          return cachedResponse;
        }
        
        // 2. 缓存未命中，从网络获取
        console.log('[SW] 🌐 Cache MISS, fetching:', url);
        
        const response = await fetch(request);
        
        // 只缓存成功的响应
        if (response && response.status === 200) {
          const responseToCache = response.clone();
          
          // 异步缓存，不阻塞响应
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
            console.log('[SW] 💾 Cached:', url);
          }).catch((error) => {
            console.warn('[SW] Cache put failed:', url, error.message);
          });
        }
        
        return response;
        
      } catch (error) {
        console.error('[SW] Fetch failed:', url, error);
        
        // 网络失败，尝试返回缓存（即使可能已经检查过）
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
          console.log('[SW] 💾 Returning cached response after network failure');
          return cachedResponse;
        }
        
        // 完全失败
        throw error;
      }
    })()
  );
});

/**
 * Message 事件：处理来自页面的消息
 */
self.addEventListener('message', (event) => {
  const { data, ports } = event;
  
  if (data.action === 'getCacheStatus') {
    // 查询缓存状态
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        
        const status = await Promise.all(
          CORE_RESOURCES.map(async (url) => {
            const cached = await cache.match(url);
            return {
              url,
              cached: !!cached
            };
          })
        );
        
        // 返回状态
        if (ports && ports[0]) {
          ports[0].postMessage({ status });
        }
        
        console.log('[SW] Cache status queried:', status);
        
      } catch (error) {
        console.error('[SW] Failed to get cache status:', error);
        if (ports && ports[0]) {
          ports[0].postMessage({ status: [], error: error.message });
        }
      }
    })();
    
  } else if (data.action === 'clearCache') {
    // 清除缓存
    (async () => {
      try {
        const deleted = await caches.delete(CACHE_NAME);
        console.log('[SW] Cache cleared:', deleted);
        
        if (ports && ports[0]) {
          ports[0].postMessage({ success: deleted });
        }
      } catch (error) {
        console.error('[SW] Failed to clear cache:', error);
        if (ports && ports[0]) {
          ports[0].postMessage({ success: false, error: error.message });
        }
      }
    })();
    
  } else if (data.action === 'skipWaiting') {
    // 强制激活新版本
    console.log('[SW] Received skipWaiting message');
    self.skipWaiting();
    
  } else {
    console.log('[SW] Unknown message action:', data.action);
  }
});

/**
 * 推送通知事件（预留）
 */
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received');
  // 未来可以实现推送通知功能
});

/**
 * 同步事件（预留）
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event received:', event.tag);
  // 未来可以实现后台同步功能
});

console.log('[SW] Service Worker script loaded');
