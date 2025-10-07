/**
 * VLM Manager - 通用视觉/音频大模型管理器
 * 负责：频率限制、文案锁定、API调用
 */

/**
 * 频率限制器
 */
class RateLimiter {
  constructor(minIntervalMs = 15000, maxPerMinute = 3) {
    this.minIntervalMs = minIntervalMs;
    this.maxPerMinute = maxPerMinute;
    this.lastCallTime = 0;
    this.callsInLastMinute = [];
  }

  canCall() {
    const now = Date.now();

    // 检查最小间隔
    if (now - this.lastCallTime < this.minIntervalMs) {
      console.log(`[RateLimiter] 距上次调用不足${this.minIntervalMs}ms`);
      return false;
    }

    // 清理超过1分钟的记录
    this.callsInLastMinute = this.callsInLastMinute.filter(
      t => now - t < 60000
    );

    // 检查每分钟次数
    if (this.callsInLastMinute.length >= this.maxPerMinute) {
      console.log(`[RateLimiter] 已达每分钟${this.maxPerMinute}次上限`);
      return false;
    }

    return true;
  }

  recordCall() {
    const now = Date.now();
    this.lastCallTime = now;
    this.callsInLastMinute.push(now);
    console.log(`[RateLimiter] 记录调用，本分钟第${this.callsInLastMinute.length}次`);
  }

  reset() {
    this.lastCallTime = 0;
    this.callsInLastMinute = [];
  }
}

/**
 * VLM通道（支持视觉和音频）
 */
class VLMChannel {
  constructor(type, config = {}) {
    this.type = type; // 'vision' or 'audio'
    this.enabled = config.enabled !== undefined ? config.enabled : true;
    this.apiEndpoint = config.apiEndpoint || '/api/qwen3vl';
    this.rateLimiter = new RateLimiter(
      config.minInterval || 15000,
      config.maxPerMinute || 3
    );
    
    // 文案锁定
    this.lock = {
      text: null,
      until: 0,
      data: null
    };
    
    // 请求状态
    this.isProcessing = false;
    this.pendingRequest = null;
  }

  /**
   * 分析数据（主入口）
   */
  async analyze(data) {
    if (!this.enabled) {
      console.log(`[VLM-${this.type}] 通道未启用`);
      return null;
    }

    if (this.isProcessing) {
      console.log(`[VLM-${this.type}] 正在处理中，忽略新请求`);
      return null;
    }

    if (!this.rateLimiter.canCall()) {
      console.log(`[VLM-${this.type}] 频率限制，降级到本地判断`);
      return null;
    }

    try {
      this.isProcessing = true;
      console.log(`[VLM-${this.type}] 开始分析...`);
      
      const result = await this.callAPI(data);
      
      if (result) {
        this.rateLimiter.recordCall();
        this.setLock(result.text, result.data);
        console.log(`[VLM-${this.type}] 分析完成: ${result.text}`);
      }
      
      return result;
    } catch (error) {
      console.error(`[VLM-${this.type}] 分析失败:`, error);
      return null;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 调用API
   */
  async callAPI(data) {
    if (this.type === 'vision') {
      return await this.callVisionAPI(data);
    } else {
      return await this.callAudioAPI(data);
    }
  }

  /**
   * 调用视觉VLM API（通过Vercel Serverless函数 - Kimi VLM）
   */
  async callVisionAPI(data) {
    try {
      // 自动使用当前域名的API端点
      // 本地: http://localhost:3000/api/kimi-vlm
      // 生产: https://your-project.vercel.app/api/kimi-vlm
      const apiUrl = window.location.origin + '/api/kimi-vlm';
      
      console.log('[VLM] 调用Kimi API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: data.image,
          prompt: '请描述图片中的内容，特别是是否有猫，如果有猫请详细描述猫的外观和行为。用一句简短的中文回答。'
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API请求失败 (${response.status}): ${errorText}`);
      }

      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'API返回失败');
      }

      console.log('[VLM] API成功:', result.text);

      return {
        text: result.text,
        data: result.data
      };
      
    } catch (error) {
      console.error('[VLM] API调用失败:', error);
      // 降级：返回默认文案
      return {
        text: '图像分析中...',
        data: { hasCat: false, confidence: 0, error: error.message }
      };
    }
  }

  /**
   * 调用音频VLM API（预留）
   */
  async callAudioAPI(data) {
    // TODO: 实现音频VLM调用
    return {
      text: '音频分析功能开发中',
      data: { hasMeow: false, confidence: 0 }
    };
  }

  /**
   * 设置文案锁定
   */
  setLock(text, data, durationMs = 30000) {
    this.lock = {
      text: text,
      until: Date.now() + durationMs,
      data: data
    };
    console.log(`[VLM-${this.type}] 锁定文案${durationMs}ms: ${text}`);
  }

  /**
   * 获取当前有效文案
   */
  getText() {
    const now = Date.now();
    if (this.lock.until > now && this.lock.text) {
      return this.lock.text;
    }
    return null;
  }

  /**
   * 检查是否锁定中
   */
  isLocked() {
    return this.lock.until > Date.now();
  }

  /**
   * 获取锁定数据
   */
  getLockData() {
    if (this.isLocked()) {
      return this.lock.data;
    }
    return null;
  }

  /**
   * 手动解锁
   */
  unlock() {
    this.lock = { text: null, until: 0, data: null };
    console.log(`[VLM-${this.type}] 手动解锁`);
  }

  /**
   * 启用/禁用通道
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    console.log(`[VLM-${this.type}] ${enabled ? '启用' : '禁用'}通道`);
  }
}

// 导出
export { VLMChannel, RateLimiter };
