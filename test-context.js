/**
 * 上下文管理系统测试脚本
 * 测试四状态分类、LRU信任机制、音频触发器和情绪分析
 */

import Mewt from './mewt.js';

// 创建模拟音频数据
function createMockAudioBuffer(length = 16384) {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    // 生成模拟的音频信号
    buffer[i] = Math.sin(2 * Math.PI * 440 * i / 44100) * 0.1 + 
                Math.random() * 0.05 - 0.025;
  }
  return buffer;
}

// 模拟图像分类结果
const mockImageResults = {
  catDetected: [
    { class: 'cat', score: 0.85 },
    { class: 'domestic_cat', score: 0.75 },
    { class: 'animal', score: 0.65 }
  ],
  noCat: [
    { class: 'dog', score: 0.70 },
    { class: 'person', score: 0.60 },
    { class: 'furniture', score: 0.45 }
  ]
};

// 模拟音频分类结果
const mockAudioResults = {
  catSound: [
    { class: 'cat', score: 0.80 },
    { class: 'meow', score: 0.75 },
    { class: 'animal_vocalization', score: 0.65 }
  ],
  noSound: [
    { class: 'silence', score: 0.90 },
    { class: 'background_noise', score: 0.40 }
  ],
  humanSound: [
    { class: 'speech', score: 0.85 },
    { class: 'human_voice', score: 0.70 }
  ]
};

async function runTests() {
  console.log('🎯 开始上下文管理系统测试\n');
  
  const mewt = new Mewt();
  
  console.log('📊 初始状态检查：');
  console.log('上下文：', mewt.getContext());
  console.log('缓存信息：', mewt.getCacheInfo());
  console.log('─'.repeat(60));

  // 测试1：四状态分类测试
  console.log('\n🧪 测试1：四状态分类');
  
  // 测试 idle 状态
  console.log('\n📍 测试 IDLE 状态（无猫无声）');
  mewt.addImageResult(mockImageResults.noCat);
  mewt.addAudioResult(mockAudioResults.noSound);
  console.log('当前状态：', mewt.determineState(mewt.hasVisualCat(), mewt.hasCatSound()));
  
  // 测试 cat_visual 状态
  console.log('\n📍 测试 CAT_VISUAL 状态（有猫无声）');
  mewt.addImageResult(mockImageResults.catDetected);
  mewt.addAudioResult(mockAudioResults.noSound);
  console.log('当前状态：', mewt.determineState(mewt.hasVisualCat(), mewt.hasCatSound()));
  
  // 测试 cat_audio 状态
  console.log('\n📍 测试 CAT_AUDIO 状态（无猫有声）');
  mewt.clearCurrentWindow();
  mewt.addImageResult(mockImageResults.noCat);
  mewt.addAudioResult(mockAudioResults.catSound);
  console.log('当前状态：', mewt.determineState(mewt.hasVisualCat(), mewt.hasCatSound()));
  
  // 测试 cat_both 状态
  console.log('\n📍 测试 CAT_BOTH 状态（有猫有声）');
  mewt.clearCurrentWindow();
  mewt.addImageResult(mockImageResults.catDetected);
  mewt.addAudioResult(mockAudioResults.catSound);
  console.log('当前状态：', mewt.determineState(mewt.hasVisualCat(), mewt.hasCatSound()));
  
  console.log('─'.repeat(60));

  // 测试2：音频触发器和情绪分析
  console.log('\n🎵 测试2：音频触发器和情绪分析');
  
  mewt.clearCurrentWindow();
  const audioBuffer = createMockAudioBuffer();
  
  console.log('\n🎯 触发音频特征分析...');
  const emotionResponse = mewt.addAudioResult(mockAudioResults.catSound, audioBuffer);
  
  if (emotionResponse) {
    console.log('✅ 情绪分析结果：');
    console.log(`   类型: ${emotionResponse.type}`);
    console.log(`   文本: ${emotionResponse.text}`);
    console.log(`   置信度: ${Math.round(emotionResponse.confidence * 100)}%`);
    console.log(`   类别: ${emotionResponse.category.title}`);
  } else {
    console.log('❌ 未触发情绪分析');
  }
  
  // 检查上下文中的音频特征
  const context = mewt.getFullContext();
  if (context.current.current_audio_feature) {
    console.log('\n📊 提取的音频特征：');
    console.log(`   过零率: ${context.current.current_audio_feature.zeroCrossingRate.toFixed(4)}`);
    console.log(`   频谱质心: ${context.current.current_audio_feature.spectralCentroid.toFixed(2)}`);
    console.log(`   频谱滚降: ${context.current.current_audio_feature.spectralRolloff.toFixed(4)}`);
    console.log(`   能量: ${context.current.current_audio_feature.energy.toFixed(6)}`);
    console.log(`   均方根: ${context.current.current_audio_feature.rms.toFixed(6)}`);
  }
  
  console.log('─'.repeat(60));

  // 测试3：LRU信任机制测试
  console.log('\n🔄 测试3：LRU信任机制');
  
  console.log('\n📈 模拟连续检测序列...');
  
  // 连续添加猫检测结果
  for (let i = 0; i < 15; i++) {
    mewt.clearCurrentWindow();
    if (i % 3 === 0) {
      // 每三次中有一次检测到猫
      mewt.addImageResult(mockImageResults.catDetected);
      console.log(`   第${i+1}次: 检测到猫 (score: ${mockImageResults.catDetected[0].score})`);
    } else {
      mewt.addImageResult(mockImageResults.noCat);
      console.log(`   第${i+1}次: 未检测到猫`);
    }
    
    // 手动更新LRU (模拟processWindow)
    mewt.updateImageLRU();
  }
  
  console.log(`\n📊 LRU缓存大小: ${mewt.context.image_lru.size()}`);
  
  // 检查最近10次检测中的信任度
  const recent10 = mewt.context.image_lru.recent(10);
  const catCount = recent10.filter(item => item.isCat).length;
  console.log(`🎯 最近10次检测中有猫的次数: ${catCount}`);
  console.log(`📈 信任状态: ${catCount > 0 ? '✅ 可信任' : '❌ 不可信任'}`);
  
  console.log('─'.repeat(60));

  // 测试4：向后兼容性测试
  console.log('\n🔄 测试4：向后兼容性');
  
  const predictions = {
    image: mockImageResults.catDetected,
    audio: mockAudioResults.catSound
  };
  
  const quickResponse = mewt.generateQuickResponse(predictions);
  console.log('🎯 快速响应:', quickResponse);
  
  const oldStyleContext = mewt.getContext();
  console.log('📊 旧格式上下文:', oldStyleContext);
  
  console.log('─'.repeat(60));

  // 测试5：1秒窗口处理模拟
  console.log('\n⏱️ 测试5：1秒窗口处理模拟');
  
  mewt.clearCurrentWindow();
  mewt.addImageResult(mockImageResults.catDetected);
  mewt.addAudioResult(mockAudioResults.catSound);
  
  console.log('🔄 执行窗口处理...');
  const windowResponse = mewt.processWindow();
  
  console.log('📋 窗口处理结果：');
  console.log(`   类型: ${windowResponse.type}`);
  console.log(`   状态: ${windowResponse.state}`);
  console.log(`   文本: ${windowResponse.text}`);
  console.log(`   关注猫咪: ${windowResponse.is_focusing_cat ? '✅' : '❌'}`);
  
  console.log('\n🔍 处理后的上下文：');
  const finalContext = mewt.getFullContext();
  console.log('   图像数据:', finalContext.current.current_image);
  console.log('   音频数据:', finalContext.current.current_audio);
  console.log('   是否关注猫咪:', finalContext.is_now_focusing_cat);
  
  console.log('\n🎉 所有测试完成！');
  
  // 清理资源
  mewt.destroy();
}

// 运行测试
runTests().catch(console.error);
