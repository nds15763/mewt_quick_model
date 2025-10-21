# Mewt 引擎统一重构总结

## 📋 重构目标
将 `debug.html` 和 `play.html` 的音视频检测逻辑统一到核心引擎中，实现 DRY 原则，确保两个页面使用完全一致的检测逻辑。

## 🏗️ 架构设计

### 新增核心模块

#### mewt-engine.js
**业务域**：猫咪检测引擎核心

**职责**：
- 整合 MediaPipe 音视频检测
- 管理 Mewt 状态机和 LRU 缓存
- 处理 VLM 视觉分析
- 管理 RN 消息通讯
- 提供统一的检测结果处理接口

**核心方法**：
- `handleImageResult()` - 处理图像检测结果
- `handleAudioResult()` - 处理音频检测结果  
- `updateState()` - 更新检测状态（含 LRU 信任机制和防抖）
- `handleStateChange()` - 处理状态变化并触发 VLM
- `getCurrentFrame()` - 获取高质量视频帧截图
- `handleRNMessage()` - 处理 RN 上行消息

**回调机制**：
- `onPredictionUpdate` - 预测结果更新时通知 UI 层
- `onStateChange` - 状态变化时通知 UI 层
- `onVLMResult` - VLM 结果返回时通知 UI 层
- `onLog` - 日志输出时通知 UI 层

## 🔄 重构内容

### debug.html 改动
**改动前**：
- 自己实例化 `Mewt`、`VLMChannel`
- 自己维护状态防抖逻辑
- 自己处理 RN 消息
- 直接调用 `mewt.addImageResult()` 等方法

**改动后**：
- 使用统一的 `MewtEngine` 实例
- 通过回调函数接收引擎通知
- 图像/音频检测：调用 `engine.handleImageResult()` / `engine.handleAudioResult()`
- UI 更新：通过 `onPredictionUpdate` 回调实现
- 日志：通过 `onLog` 回调实现

**代码量变化**：
- 删除了约 150 行重复的状态管理代码
- 检测处理简化为 2 行核心调用

### play.html 改动
**改动前**：
- 自己实例化 `Mewt`、`VLMChannel`
- 自己维护状态防抖逻辑
- 自己处理 RN 消息
- 手动判断 hasVisualCat/hasAudioCat
- 手动应用 LRU 信任机制

**改动后**：
- 使用统一的 `MewtEngine` 实例
- 通过回调函数接收引擎通知
- 图像/音频检测：调用 `engine.handleImageResult()` / `engine.handleAudioResult()`
- UI 更新：通过 `onPredictionUpdate` 回调实现
- 所有状态判断逻辑都由引擎处理

**代码量变化**：
- 删除了约 200 行重复的检测和状态管理代码
- 检测处理简化为 2 行核心调用
- `updateDisplay()` 函数从 120+ 行减少到 30 行

## ✨ 重构优势

### 1. DRY 原则（Don't Repeat Yourself）
- **单一真相源**：所有核心逻辑只在 `mewt-engine.js` 中维护
- **自动同步**：修改引擎即可同步两个页面
- **避免 Bug**：不会出现逻辑不一致的问题

### 2. 职责分离
- **引擎层**：负责检测、状态管理、VLM、RN 通讯
- **UI 层**：只负责页面显示和用户交互
- **清晰边界**：通过回调函数明确接口

### 3. 可维护性提升
- **集中维护**：所有检测逻辑改动只需在一处
- **易于测试**：引擎可以独立测试
- **易于扩展**：新功能只需在引擎中添加

### 4. 代码复用
- **模块化设计**：引擎充分利用现有模块
  - `mewt.js` - 数据收集和 LRU 缓存
  - `state-manager.js` - 四状态判断
  - `window-processor.js` - 时间窗口处理
  - `vlm-manager.js` - VLM 视觉分析
  - `rn-bridge.js` / `rn-message-receiver.js` - RN 通讯

### 5. 一致性保证
- **检测逻辑**：完全一致
- **状态判断**：完全一致
- **LRU 信任机制**：完全一致
- **防抖处理**：完全一致
- **VLM 触发时机**：完全一致

## 📊 代码统计

### 删除的重复代码
- debug.html：~150 行
- play.html：~200 行
- **总计**：~350 行重复代码被消除

### 新增代码
- mewt-engine.js：~650 行（含详细注释）

### 净减少
- 总代码量：-350 + 650 = +300 行
- 但实现了逻辑集中化和代码复用

## 🔑 关键实现细节

### 1. 状态管理统一
```javascript
// 引擎内部统一管理
this.state = {
  stable: 'idle',       // 稳定状态
  pending: 'idle',      // 待定状态
  lastStable: 'idle',   // 上一个稳定状态
  changeTime: 0         // 状态变化时间
};
```

### 2. LRU 信任机制集成
```javascript
// 在 updateState() 中统一应用
let hasVisual = this.mewt.hasVisualCat();
if (!hasVisual) {
  const recent10 = context.image_lru.recent(10);
  const catCount = recent10.filter(item => item.isCat).length;
  if (catCount > 0) {
    hasVisual = true; // Trust LRU history
  }
}
```

### 3. 防抖处理统一
```javascript
// 2秒防抖，避免状态抖动
if (now - this.state.changeTime >= this.STATE_DEBOUNCE_MS) {
  this.state.stable = this.state.pending;
  // 检测状态变化并触发 VLM
  if (this.state.stable !== this.state.lastStable) {
    this.handleStateChange(this.state.stable, this.state.lastStable);
  }
}
```

### 4. VLM 触发统一
```javascript
// 在状态变化时自动触发
const hasVisual = newState === 'cat_visual' || newState === 'cat_both';
const hadVisual = oldState === 'cat_visual' || oldState === 'cat_both';

if (hasVisual && !hadVisual) {
  // 开始看到猫 - 调用 VLM 确认
  const frame = this.getCurrentFrame();
  await this.vlmVision.analyze({ image: frame });
}
```

## 🎯 使用方式

### debug.html 使用示例
```javascript
const engine = new MewtEngine({
  onPredictionUpdate: (data) => {
    updateDebugPanels(data);  // 更新调试面板
  },
  onStateChange: (newState, oldState) => {
    addLog(`State Change: ${oldState} → ${newState}`);
  },
  onVLMResult: (result) => {
    addLog(`✓ VLM: ${result.text}`);
  },
  onLog: (message) => {
    addLog(message);
  }
});

// 图像检测 - 一行搞定
const result = imageClassifier.classifyForVideo(video, now);
engine.handleImageResult(result.classifications);

// 音频检测 - 一行搞定
const result = audioClassifier.classify(inputData);
engine.handleAudioResult(result, inputData);
```

### play.html 使用示例
```javascript
const engine = new MewtEngine({
  onPredictionUpdate: (data) => {
    updateDisplay(data);  // 更新显示
  }
});

// 设置视频元素引用
engine.setVideoElement(video);

// 图像检测 - 一行搞定
engine.handleImageResult(result.classifications);

// 音频检测 - 一行搞定
engine.handleAudioResult(result, inputData);
```

## ✅ 验证清单

- [x] debug.html 使用统一引擎
- [x] play.html 使用统一引擎
- [x] 两个页面使用相同的检测逻辑
- [x] LRU 信任机制正常工作
- [x] 状态防抖机制正常工作
- [x] VLM 触发时机正确
- [x] RN 消息通讯正常
- [x] 代码注释完整（按照业务域关键词规范）

## 📝 注释规范

所有方法都按照统一规范添加了注释：

```javascript
/*
方法名：处理图像检测结果
方法简介：接收 MediaPipe 图像分类结果，存储到最新预测，喂给 Mewt 实例，
          添加到窗口处理器，触发状态更新。
业务域关键词：图像检测、MediaPipe分类、Mewt数据收集、窗口处理、状态更新
Param: classifications - MediaPipe 图像分类结果数组
*/
```

## 🚀 后续优化建议

1. **单元测试**：为 `mewt-engine.js` 添加完整的单元测试
2. **性能监控**：添加性能监控指标（检测延迟、状态变化频率等）
3. **配置外部化**：将阈值等配置参数外部化，方便调整
4. **错误处理**：增强错误处理和降级策略
5. **文档完善**：添加 API 文档和使用示例

## 📌 重要提示

**修改检测逻辑时**：
- ✅ 只需修改 `mewt-engine.js`
- ✅ 修改后两个页面自动同步
- ❌ 不要在 debug.html 或 play.html 中修改检测逻辑

**添加新功能时**：
- ✅ 在 `mewt-engine.js` 中添加方法
- ✅ 通过回调函数通知 UI 层
- ✅ 保持职责分离原则

---

**重构完成时间**：2025-10-21
**重构人员**：Cline AI Assistant
