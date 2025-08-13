// mewt.js - Mewt 快速模型处理模块

class LRUCache {
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key);
    // 更新访问顺序
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 如果超出最大尺寸，删除最久未使用的项
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, value);
  }

  has(key) {
    return this.cache.has(key);
  }

  clear() {
    this.cache.clear();
  }

  size() {
    return this.cache.size;
  }
}

class Mewt {
  constructor() {
    // 上下文信息
    this.context = {
      lastCatDetection: 0,
      catDetectionCount: 0,
      lastCatSound: 0,
      catSoundCount: 0,
      lastResponseTime: 0,
      responseCount: 0
    };

    // LRU 缓存
    this.cache = new LRUCache(50);

    // 配置参数
    this.config = {
      MIN_RESPONSE_INTERVAL: 3000, // 最小响应间隔 3 秒
      CAT_DETECTION_THRESHOLD: 0.3, // 猫检测阈值
      CAT_SOUND_THRESHOLD: 0.2,     // 猫叫声阈值
      MAX_RESPONSES_PER_MINUTE: 10  // 每分钟最大响应次数
    };
  }

  // 生成缓存键
  generateCacheKey(predictions) {
    // 提取前3个图像和音频分类结果作为缓存键
    const imageKeys = predictions.image
      .slice(0, 3)
      .map(item => `${item.class}-${Math.round(item.score * 100)}`)
      .join('|');
      
    const audioKeys = predictions.audio
      .slice(0, 3)
      .map(item => `${item.class}-${Math.round(item.score * 100)}`)
      .join('|');
      
    return `${imageKeys}__${audioKeys}`;
  }

  // 检查是否应该响应
  shouldRespond() {
    const now = Date.now();
    
    // 检查最小响应间隔
    if (now - this.context.lastResponseTime < this.config.MIN_RESPONSE_INTERVAL) {
      return false;
    }
    
    // 检查每分钟最大响应次数
    if (now - this.context.lastResponseTime > 60000) {
      this.context.responseCount = 0;
    }
    
    if (this.context.responseCount >= this.config.MAX_RESPONSES_PER_MINUTE) {
      return false;
    }
    
    return true;
  }

  // 更新上下文
  updateContext(predictions) {
    const now = Date.now();
    
    // 检查是否有猫相关的图像
    const catInImage = predictions.image.some(item => 
      item.class.toLowerCase().includes('cat') && item.score > this.config.CAT_DETECTION_THRESHOLD);
      
    // 检查是否有猫相关的音频
    const catSoundInAudio = predictions.audio.some(item => 
      (item.class.toLowerCase().includes('cat') || 
       item.class.toLowerCase().includes('meow')) && item.score > this.config.CAT_SOUND_THRESHOLD);
    
    // 更新上下文
    if (catInImage) {
      this.context.lastCatDetection = now;
      this.context.catDetectionCount++;
    }
    
    if (catSoundInAudio) {
      this.context.lastCatSound = now;
      this.context.catSoundCount++;
    }
  }

  // 生成快速响应
  generateQuickResponse(predictions) {
    // 检查是否应该响应
    if (!this.shouldRespond()) {
      return null; // 不应该响应
    }
    
    // 生成缓存键
    const cacheKey = this.generateCacheKey(predictions);
    
    // 检查缓存
    if (this.cache.has(cacheKey)) {
      const cachedResponse = this.cache.get(cacheKey);
      // 更新最后响应时间
      this.context.lastResponseTime = Date.now();
      this.context.responseCount++;
      return cachedResponse;
    }
    
    // 更新上下文
    this.updateContext(predictions);
    
    // 检查是否有猫相关的图像
    const catInImage = predictions.image.some(item => 
      item.class.toLowerCase().includes('cat') && item.score > this.config.CAT_DETECTION_THRESHOLD);
      
    // 检查是否有猫相关的音频
    const catSoundInAudio = predictions.audio.some(item => 
      (item.class.toLowerCase().includes('cat') || 
       item.class.toLowerCase().includes('meow')) && item.score > this.config.CAT_SOUND_THRESHOLD);
    
    let response = null;
    
    // 生成响应
    if (catInImage && catSoundInAudio) {
      response = "哦！是个小猫";
    } else if (catSoundInAudio) {
      response = "诶？我好像听到小猫叫了";
    } else if (catInImage) {
      response = "那里有只小猫";
    } else {
      // 没有检测到猫相关的内容
      response = "观察中...";
    }
    
    // 更新缓存
    this.cache.set(cacheKey, response);
    
    // 更新最后响应时间
    this.context.lastResponseTime = Date.now();
    this.context.responseCount++;
    
    return response;
  }

  // 获取上下文信息（用于调试）
  getContext() {
    return { ...this.context };
  }

  // 获取缓存信息（用于调试）
  getCacheInfo() {
    return {
      size: this.cache.size(),
      // 注意：不返回具体的缓存内容以保护隐私
    };
  }
}

// 导出 Mewt 类
export default Mewt;