/**
 * Service Worker 管理器
 * 负责注册、监控、查询 Service Worker 状态
 * 
 * 业务域：Service Worker 生命周期管理
 * 业务域简述：管理 Service Worker 的注册、激活、状态查询和缓存监控，
 *           为 MewtEngine 提供统一的 SW 管理接口。
 */

import { SW_CONFIG, CACHEABLE_RESOURCES } from './mediapipe-config.js';

export class ServiceWorkerManager {
  /**
   * 创建 Service Worker 管理器实例
   * @param {Function} onLog - 日志回调函数
   */
  constructor(onLog = null) {
    this.registration = null;
    this.onLog = onLog;
    this.cacheStatus = {
      isReady: false,
      cached: 0,
      total: CACHEABLE_RESOURCES.length,
      lastUpdate: null
    };
    this.isRegistering = false;
  }

  /**
   * 注册 Service Worker
   * @returns {Promise<boolean>} 是否注册成功
   */
  async register() {
    // 检查浏览器支持
    if (!('serviceWorker' in navigator)) {
      this.log('Service Worker 不支持（浏览器不兼容）');
      return false;
    }

    // 检查配置是否启用
    if (!SW_CONFIG.enabled) {
      this.log('Service Worker 已在配置中禁用');
      return false;
    }

    // 防止重复注册
    if (this.isRegistering) {
      this.log('Service Worker 正在注册中，跳过重复请求');
      return false;
    }

    this.isRegistering = true;

    try {
      this.log('开始注册 Service Worker...');
      
      // 注册 Service Worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: SW_CONFIG.scope
      });
      
      this.log(`Service Worker 注册成功: ${this.registration.scope}`);
      
      // 等待激活
      await this.waitForActivation();
      
      // 查询缓存状态
      await this.updateCacheStatus();
      
      // 监听更新
      this.setupUpdateListener();
      
      this.isRegistering = false;
      return true;
      
    } catch (error) {
      this.log(`Service Worker 注册失败: ${error.message}`);
      console.error('[SW Manager] Registration error:', error);
      this.isRegistering = false;
      return false;
    }
  }

  /**
   * 等待 Service Worker 激活
   * @returns {Promise<void>}
   */
  async waitForActivation() {
    if (!this.registration) return;
    
    const sw = this.registration.active || this.registration.installing || this.registration.waiting;
    
    if (!sw) {
      this.log('未找到 Service Worker 实例');
      return;
    }
    
    if (sw.state === 'activated') {
      this.log('Service Worker 已处于激活状态');
      return;
    }
    
    this.log(`Service Worker 当前状态: ${sw.state}，等待激活...`);
    
    await new Promise((resolve) => {
      sw.addEventListener('statechange', () => {
        this.log(`Service Worker 状态变化: ${sw.state}`);
        if (sw.state === 'activated') {
          this.log('Service Worker 已激活');
          resolve();
        }
      });
    });
  }

  /**
   * 监听 Service Worker 更新
   */
  setupUpdateListener() {
    if (!this.registration) return;
    
    this.registration.addEventListener('updatefound', () => {
      this.log('发现 Service Worker 更新');
      const newWorker = this.registration.installing;
      
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.log('新版本 Service Worker 已安装，等待激活');
          }
        });
      }
    });
  }

  /**
   * 查询缓存状态
   * @returns {Promise<Object|null>} 缓存状态对象
   */
  async updateCacheStatus() {
    if (!this.registration || !this.registration.active) {
      this.log('Service Worker 未激活，无法查询缓存状态');
      return null;
    }
    
    try {
      const messageChannel = new MessageChannel();
      
      const statusPromise = new Promise((resolve, reject) => {
        // 设置超时
        const timeout = setTimeout(() => {
          reject(new Error('查询缓存状态超时'));
        }, 5000);
        
        messageChannel.port1.onmessage = (event) => {
          clearTimeout(timeout);
          resolve(event.data.status);
        };
      });
      
      // 发送查询请求
      this.registration.active.postMessage(
        { action: 'getCacheStatus' },
        [messageChannel.port2]
      );
      
      const status = await statusPromise;
      
      // 更新缓存状态
      this.cacheStatus.cached = status.filter(s => s.cached).length;
      this.cacheStatus.total = status.length;
      this.cacheStatus.isReady = this.cacheStatus.cached === this.cacheStatus.total;
      this.cacheStatus.lastUpdate = Date.now();
      
      const percentage = this.cacheStatus.total > 0 
        ? ((this.cacheStatus.cached / this.cacheStatus.total) * 100).toFixed(0)
        : 0;
      
      this.log(`缓存状态更新: ${this.cacheStatus.cached}/${this.cacheStatus.total} (${percentage}%)`);
      
      if (this.cacheStatus.isReady) {
        this.log('✅ 所有 MediaPipe 资源已缓存');
      } else {
        this.log(`⏳ 缓存进行中，剩余 ${this.cacheStatus.total - this.cacheStatus.cached} 个资源`);
      }
      
      return this.cacheStatus;
      
    } catch (error) {
      this.log(`查询缓存状态失败: ${error.message}`);
      console.error('[SW Manager] Cache status query error:', error);
      return null;
    }
  }

  /**
   * 获取当前缓存状态（同步方法）
   * @returns {Object} 缓存状态对象
   */
  getCacheStatus() {
    return { ...this.cacheStatus };
  }

  /**
   * 检查 Service Worker 是否已注册并激活
   * @returns {boolean} 是否就绪
   */
  isReady() {
    return this.registration && this.registration.active;
  }

  /**
   * 手动触发缓存更新检查
   * @returns {Promise<void>}
   */
  async checkForUpdates() {
    if (!this.registration) {
      this.log('Service Worker 未注册，无法检查更新');
      return;
    }
    
    try {
      this.log('检查 Service Worker 更新...');
      await this.registration.update();
      this.log('更新检查完成');
    } catch (error) {
      this.log(`更新检查失败: ${error.message}`);
    }
  }

  /**
   * 清除所有缓存（用于调试）
   * @returns {Promise<boolean>} 是否清除成功
   */
  async clearCache() {
    try {
      this.log('清除所有缓存...');
      const cacheNames = await caches.keys();
      
      await Promise.all(
        cacheNames.map(name => {
          this.log(`删除缓存: ${name}`);
          return caches.delete(name);
        })
      );
      
      this.log('✅ 缓存已清除');
      
      // 重置状态
      this.cacheStatus.cached = 0;
      this.cacheStatus.isReady = false;
      this.cacheStatus.lastUpdate = Date.now();
      
      return true;
    } catch (error) {
      this.log(`清除缓存失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 注销 Service Worker（用于调试）
   * @returns {Promise<boolean>} 是否注销成功
   */
  async unregister() {
    if (!this.registration) {
      this.log('Service Worker 未注册');
      return false;
    }
    
    try {
      this.log('注销 Service Worker...');
      const success = await this.registration.unregister();
      
      if (success) {
        this.log('✅ Service Worker 已注销');
        this.registration = null;
      } else {
        this.log('❌ Service Worker 注销失败');
      }
      
      return success;
    } catch (error) {
      this.log(`注销失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 获取详细状态信息（用于调试）
   * @returns {Object} 详细状态
   */
  getDetailedStatus() {
    return {
      isSupported: 'serviceWorker' in navigator,
      isRegistered: !!this.registration,
      isActive: this.isReady(),
      scope: this.registration?.scope || null,
      state: this.registration?.active?.state || null,
      cache: this.getCacheStatus(),
      config: SW_CONFIG
    };
  }

  /**
   * 日志输出
   * @param {string} message - 日志消息
   */
  log(message) {
    const timestamp = new Date().toLocaleTimeString('zh-CN');
    const fullMessage = `[SW Manager ${timestamp}] ${message}`;
    
    console.log(fullMessage);
    
    if (this.onLog) {
      this.onLog(fullMessage);
    }
  }
}

export default ServiceWorkerManager;
