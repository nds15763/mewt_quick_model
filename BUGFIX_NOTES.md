# 🐛 Bug 修复说明

## 问题描述

**症状**：
- debug.html 中图像检测面板显示 "No data"
- 控制台出现 WebGL 错误：`GL_INVALID_FRAMEBUFFER_OPERATION`
- 视频预览正常，但分类器无法读取视频帧

**根本原因**：
视频元素的 `loadeddata` 事件在元数据加载后立即触发，但此时：
1. 视频的实际帧缓冲区可能还未初始化
2. `videoWidth` 和 `videoHeight` 可能为 0
3. MediaPipe 尝试从空帧缓冲区读取数据导致 WebGL 错误

## 修复方案

### 改进视频初始化逻辑

**之前**（不可靠）：
```javascript
video.addEventListener("loadeddata", predictWebcam);
```

**现在**（健壮）：
```javascript
video.addEventListener("playing", () => {
  setTimeout(() => {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      console.log(`✓ Video ready: ${video.videoWidth}x${video.videoHeight}`);
      predictWebcam();
    } else {
      console.error("Video playing but dimensions are 0");
    }
  }, 100);
});
```

### 修复要点

1. **使用 `playing` 事件**：确保视频真正开始播放
2. **添加延迟验证**：100ms 延迟确保至少渲染了一帧
3. **尺寸验证**：明确检查 `videoWidth > 0 && videoHeight > 0`
4. **日志记录**：在 debug.html 中记录初始化状态

## 修改的文件

### 1. debug.html
- ✅ 修复视频初始化逻辑
- ✅ 添加调试日志记录
- ✅ 改进错误处理

### 2. play.html
- ✅ 同步应用相同的修复
- ✅ 确保生产环境的稳定性

## 验证步骤

### 测试 debug.html

1. 打开 `http://localhost:8000/debug.html`
2. 授权摄像头和麦克风
3. 检查决策日志面板，应该看到：
   ```
   [时间] Video initialized: 640x480
   ```
4. IMAGE DETECTIONS 面板应该开始显示检测结果
5. 不应该再出现 WebGL 错误

### 测试 play.html

1. 打开 `http://localhost:8000/play.html`
2. 授权摄像头和麦克风
3. 检查浏览器控制台，应该看到：
   ```
   ✓ Video ready: 640x480
   ```
4. 图像检测应该正常工作

## 预期结果

**✅ 成功标志**：
- 视频尺寸正确记录（如 640x480, 1280x720 等）
- IMAGE DETECTIONS 面板显示分类结果
- 无 WebGL 错误
- LRU 缓存开始填充新数据

**❌ 如果仍有问题**：
1. 检查浏览器兼容性（建议使用 Chrome/Edge）
2. 确认摄像头权限已授予
3. 查看控制台是否有其他错误
4. 尝试刷新页面重新初始化

## 技术细节

### 为什么需要延迟？

即使 `playing` 事件触发，第一帧可能还在渲染中。100ms 的延迟：
- 确保至少有一帧完整渲染
- 给浏览器时间更新 videoWidth/videoHeight
- 避免竞态条件

### 为什么两个文件都要修复？

虽然 play.html 目前能工作，但：
- 存在相同的潜在风险
- 不同设备/浏览器可能表现不同
- 统一的代码更易维护

## 后续建议

1. **监控生产环境**：观察是否还有初始化失败的情况
2. **考虑超时机制**：如果 10 秒后视频仍未就绪，显示错误提示
3. **添加重试逻辑**：允许用户手动重新初始化摄像头

## 修复日期

2025/10/6

## 相关文件

- `debug.html` - 调试控制台
- `play.html` - 生产页面
- `DEBUG_GUIDE.md` - 调试指南
- `BUGFIX_NOTES.md` - 本文档
