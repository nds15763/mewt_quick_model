/**
 * LRU（最近最少使用）缓存实现
 * ===============================
 * 
 * 📋 模块功能概述：
 * 本模块实现了一个高效的LRU（Least Recently Used）缓存系统，专门用于猫咪检测系统中的图像检测结果信任机制。
 * 通过维护最近检测结果的历史记录，支持基于历史数据的智能决策。
 * 
 * 🎯 核心功能：
 * 1. 固定容量的缓存管理（默认20个条目）
 * 2. 自动淘汰最久未访问的数据项
 * 3. 支持按时间顺序访问最近的N个记录
 * 4. 提供缓存统计和状态查询接口
 * 
 * 🏗️ 数据结构设计：
 * - 基于 JavaScript Map 实现，保证 O(1) 的读写性能
 * - 键值对存储：key为时间戳+类别的唯一标识，value为检测结果对象
 * - 自动维护访问顺序，最新访问的项目移动到末尾
 * 
 * 📊 典型用例（猫咪检测信任机制）：
 * ```javascript
 * const cache = new LRUCache(20);
 * 
 * // 添加检测结果
 * cache.set('cat_1640995200000', {
 *   class: 'cat',
 *   score: 0.85,
 *   timestamp: 1640995200000,
 *   isCat: true
 * });
 * 
 * // 检查最近10次检测中的猫咪出现次数
 * const recent10 = cache.recent(10);
 * const catCount = recent10.filter(item => item.isCat).length;
 * const trustLevel = catCount > 3 ? 'high' : 'low';
 * ```
 * 
 * 🔄 信任机制工作原理：
 * 1. 每次图像分类结果都会存储到LRU缓存
 * 2. 当当前帧没有检测到猫时，查询最近N次的检测历史
 * 3. 如果历史记录中存在猫的检测，则保持"关注猫咪"状态
 * 4. 这样避免了因为单帧检测失败导致的状态频繁切换
 * 
 * 🚀 性能特点：
 * - 所有基本操作（get, set, has）都是 O(1) 时间复杂度
 * - 内存使用可控，超出容量自动删除旧数据
 * - 支持高频调用，适合实时检测场景
 * 
 * 🔗 与系统其他模块的集成：
 * - 被 WindowProcessor 调用，存储每秒的图像检测结果
 * - 被 StateManager 查询，用于状态转移的信任判断
 * - 为 ContextManager 提供历史数据统计接口
 */

/**
 * LRU缓存类
 * 实现最近最少使用缓存算法，支持固定容量和自动淘汰
 */
export class LRUCache {
  /**
   * 构造函数
   * @param {number} maxSize - 缓存最大容量
   */
  constructor(maxSize) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  /**
   * 获取缓存项并更新访问顺序
   * @param {string} key - 缓存键
   * @returns {any} 缓存值，如果不存在则返回 undefined
   */
  get(key) {
    if (!this.cache.has(key)) return undefined;
    
    const value = this.cache.get(key);
    // 更新访问顺序：删除后重新插入到末尾
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  /**
   * 设置缓存项
   * @param {string} key - 缓存键
   * @param {any} value - 缓存值
   */
  set(key, value) {
    // 如果已存在，先删除旧值
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 如果超出最大容量，删除最久未使用的项（Map中的第一个）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    // 添加新项到末尾
    this.cache.set(key, value);
  }

  /**
   * 检查是否存在指定键
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 清空所有缓存
   */
  clear() {
    this.cache.clear();
  }

  /**
   * 获取当前缓存大小
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * 获取最近的N个缓存值（按插入/访问顺序）
   * @param {number} count - 要获取的项目数量
   * @returns {Array} 最近的缓存值数组
   */
  recent(count) {
    const values = Array.from(this.cache.values());
    return values.slice(-count); // 返回最近的count个值
  }

  /**
   * 获取所有缓存值
   * @returns {Array} 所有缓存值的数组
   */
  getAllValues() {
    return Array.from(this.cache.values());
  }

  /**
   * 获取所有缓存键
   * @returns {Array} 所有缓存键的数组
   */
  getAllKeys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 包含大小、容量、使用率等信息
   */
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      utilization: (this.cache.size / this.maxSize * 100).toFixed(1) + '%',
      isEmpty: this.cache.size === 0,
      isFull: this.cache.size >= this.maxSize
    };
  }
}

export default LRUCache;
