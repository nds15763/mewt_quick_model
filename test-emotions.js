// Test script for emotion classification rule engine
import { classifyEmotion, classifyEmotionCategory } from './emotions.js';

// Test audio features (simulated)
const testFeatures = [
  {
    name: "Very quiet/comfortable sound",
    features: {
      zeroCrossingRate: 0.01,
      spectralCentroid: 800,
      spectralRolloff: 0.2,
      energy: 0.00001,
      rms: 0.001
    }
  },
  {
    name: "Medium energy asking for food",
    features: {
      zeroCrossingRate: 0.05,
      spectralCentroid: 2000,
      spectralRolloff: 0.4,
      energy: 0.0005,
      rms: 0.5
    }
  },
  {
    name: "High intensity warning/fight",
    features: {
      zeroCrossingRate: 0.09,
      spectralCentroid: 4500,
      spectralRolloff: 0.8,
      energy: 0.0009,
      rms: 0.9
    }
  }
];

console.log("🐱 Emotion Classification Test Results:\n");

testFeatures.forEach(test => {
  console.log(`📊 Testing: ${test.name}`);
  console.log(`Features:`, test.features);
  
  const result = classifyEmotion(test.features);
  const category = classifyEmotionCategory(test.features);
  
  if (result) {
    console.log(`✅ Result: ${result.emotion.icon} ${result.emotion.title}`);
    console.log(`📂 Category: ${result.category.title}`);
    console.log(`🎯 Confidence: ${Math.round(result.confidence * 100)}%`);
    console.log(`📝 Description: ${result.emotion.description}`);
  } else {
    console.log(`❌ No emotion detected (confidence too low)`);
  }
  
  console.log("─".repeat(50));
});

console.log("🎉 Test completed!");
