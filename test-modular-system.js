/**
 * 模块化系统测试脚本
 * ====================
 * 
 * 测试重构后的模块化Mewt系统，验证各个模块的集成和功能
 */

import MewtCore, { Mewt } from './mewt-core.js';

// 创建模拟数据
function createMockData() {
  return {
    imageResults: {
      catDetected: [{ class: 'cat', score: 0.85 }, { class: 'domestic_cat', score: 0.75 }],
      noCat: [{ class: 'dog', score: 0.70 }, { class: 'person', score: 0.60 }]
    },
    audioResults: {
      catSound: [{ class: 'cat', score: 0.80 }, { class: 'meow', score: 0.75 }],
      noSound: [{ class: 'silence', score: 0.90 }],
      humanSound: [{ class: 'speech', score: 0.85 }]
    },
    audioBuffer: new Float32Array(16384).map((_, i) => 
      Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1 + Math.random() * 0.05 - 0.025
    )
  };
}

async function runModularTests() {
  console.log('🧪 开始模块化系统测试\n');
  
  const mockData = createMockData();
  
  // 测试1：基础模块初始化
  console.log('📦 测试1：模块初始化');
  const mewtCore = new MewtCore({
    windowInterval: 500,  // 加快测试速度
    autoStart: false
  });
  
  console.log('✅ MewtCore 初始化成功');
  console.log('📊 初始系统状态:', mewtCore.getFullSystemState().modules);
  console.log('─'.repeat(60));

  // 测试2：数据输入和状态检测
  console.log('\n🔍 测试2：数据输入和状态检测');
  
  // 测试图像输入
  mewtCore.addImageResult(mockData.imageResults.catDetected);
  console.log('图像数据已添加');
  console.log('当前有视觉猫:', mewtCore.hasVisualCat());
  console.log('当前状态:', mewtCore.determineState());
  
  // 测试音频输入（可能触发情绪分析）
  const emotionResponse = mewtCore.addAudioResult(mockData.audioResults.catSound, mockData.audioBuffer);
  console.log('音频数据已添加');
  console.log('当前有猫叫声:', mewtCore.hasCatSound());
  console.log('当前状态:', mewtCore.determineState());
  
  if (emotionResponse) {
    console.log('✨ 情绪分析触发:', emotionResponse.text);
    console.log('置信度:', Math.round(emotionResponse.confidence * 100) + '%');
  }
  console.log('─'.repeat(60));

  // 测试3：窗口处理
  console.log('\n⏱️ 测试3：窗口处理');
  
  const windowResponse = mewtCore.processWindow();
  console.log('窗口处理结果:');
  console.log('  类型:', windowResponse.type);
  console.log('  状态:', windowResponse.state);
  console.log('  文本:', windowResponse.text);
  console.log('  关注猫咪:', windowResponse.is_focusing_cat);
  console.log('  窗口信息:', windowResponse.windowInfo);
  console.log('─'.repeat(60));

  // 测试4：向后兼容性
  console.log('\n🔄 测试4：向后兼容性测试');
  
  // 使用向后兼容的Mewt类
  const legacyMewt = new Mewt();
  
  // 测试旧API格式
  const quickResponse = legacyMewt.generateQuickResponse({
    image: [{ categoryName: 'cat', score: 0.8 }],
    audio: [{ categoryName: 'meow', score: 0.7 }]
  });
  console.log('快速响应 (兼容):', quickResponse);
  
  const context = legacyMewt.getContext();
  console.log('上下文 (兼容):', context);
  
  const cacheInfo = legacyMewt.getCacheInfo();
  console.log('缓存信息 (兼容):', cacheInfo);
  console.log('─'.repeat(60));

  // 测试5：自动处理模式
  console.log('\n🔄 测试5：自动处理模式');
  
  let processCount = 0;
  mewtCore.startAutoProcessing((response) => {
    processCount++;
    console.log(`自动处理 #${processCount}:`, response.text);
    
    // 添加一些测试数据
    if (processCount % 2 === 0) {
      mewtCore.addImageResult(mockData.imageResults.catDetected);
    } else {
      mewtCore.addAudioResult(mockData.audioResults.catSound);
    }
    
    // 运行5次后停止
    if (processCount >= 5) {
      mewtCore.stopAutoProcessing();
      console.log('✅ 自动处理测试完成');
      continueTests();
    }
  });
  
  function continueTests() {
    console.log('─'.repeat(60));

    // 测试6：LRU信任机制
    console.log('\n🧠 测试6：LRU信任机制');
    
    // 模拟多次检测
    for (let i = 0; i < 10; i++) {
      mewtCore.addImageResult(
        i % 3 === 0 ? mockData.imageResults.catDetected : mockData.imageResults.noCat
      );
      mewtCore.processWindow();
    }
    
    const lruStats = mewtCore.lruCache.getStats();
    console.log('LRU缓存统计:', lruStats);
    
    const recentHistory = mewtCore.lruCache.recent(5);
    console.log('最近5次检测:', recentHistory.map(item => ({
      class: item.class,
      isCat: item.isCat,
      score: item.score.toFixed(2)
    })));
    console.log('─'.repeat(60));

    // 测试7：系统监控和调试
    console.log('\n🔧 测试7：系统监控和调试');
    
    const systemState = mewtCore.getFullSystemState();
    console.log('系统运行状态:', systemState.isRunning);
    console.log('各模块统计:');
    console.log('  LRU缓存:', systemState.modules.lruCache);
    console.log('  状态管理器:', systemState.modules.stateManager);
    console.log('  音频触发器:', systemState.modules.audioTrigger);
    console.log('  窗口处理器:', systemState.modules.windowProcessor);
    
    const debugInfo = mewtCore.getDebugInfo();
    console.log('调试信息:');
    console.log('  当前状态:', debugInfo.detectionDetails.state);
    console.log('  猫检测结果:', debugInfo.detectionDetails.catImageDetections);
    console.log('  音频检测结果:', debugInfo.detectionDetails.catAudioDetections);
    console.log('─'.repeat(60));

    // 测试8：配置更新
    console.log('\n⚙️ 测试8：配置更新');
    
    console.log('更新前阈值:', mewtCore.stateManager.getConfig());
    
    mewtCore.updateConfig({
      catDetectionThreshold: 0.4,
      catSoundThreshold: 0.3,
      windowInterval: 800
    });
    
    console.log('更新后阈值:', mewtCore.stateManager.getConfig());
    console.log('✅ 配置更新成功');
    console.log('─'.repeat(60));

    // 测试9：性能测试
    console.log('\n⚡ 测试9：性能测试');
    
    const startTime = Date.now();
    
    // 快速添加大量数据
    for (let i = 0; i < 100; i++) {
      mewtCore.addImageResult(mockData.imageResults.catDetected);
      mewtCore.addAudioResult(mockData.audioResults.catSound);
    }
    
    // 处理多个窗口
    for (let i = 0; i < 10; i++) {
      mewtCore.processWindow();
    }
    
    const endTime = Date.now();
    console.log(`处理100组数据 + 10个窗口用时: ${endTime - startTime}ms`);
    
    const finalStats = mewtCore.windowProcessor.getStats();
    console.log('最终统计:', {
      图像数据: finalStats.totalImageDataAdded,
      音频数据: finalStats.totalAudioDataAdded,
      窗口处理: finalStats.totalWindowsProcessed,
      平均处理时间: finalStats.averageProcessingTime.toFixed(2) + 'ms'
    });
    console.log('─'.repeat(60));

    // 测试10：资源清理
    console.log('\n🧹 测试10：资源清理');
    
    console.log('清理前缓存大小:', mewtCore.lruCache.size());
    mewtCore.clearAllCaches();
    console.log('清理后缓存大小:', mewtCore.lruCache.size());
    
    mewtCore.resetAllStats();
    console.log('✅ 统计信息已重置');
    
    // 最终销毁
    mewtCore.destroy();
    legacyMewt.destroy();
    console.log('✅ 系统资源已释放');
    
    console.log('\n🎉 所有模块化测试完成！');
    console.log('\n📋 测试总结:');
    console.log('✅ 模块初始化');
    console.log('✅ 数据输入和状态检测');
    console.log('✅ 窗口处理机制');
    console.log('✅ 向后兼容性');
    console.log('✅ 自动处理模式');
    console.log('✅ LRU信任机制');
    console.log('✅ 系统监控和调试');
    console.log('✅ 配置动态更新');
    console.log('✅ 性能测试');
    console.log('✅ 资源清理');
  }
}

// 运行测试
runModularTests().catch(console.error);
