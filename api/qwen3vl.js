import OpenAI from 'openai';

export default async function handler(req, res) {
  // 只允许POST请求
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image, prompt } = req.body;

    if (!image || !prompt) {
      return res.status(400).json({ 
        success: false,
        error: 'Missing required fields: image, prompt' 
      });
    }

    console.log('[Vercel API] 收到VLM请求');

    // 初始化OpenAI客户端（魔搭兼容模式）
    const openai = new OpenAI({
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1'
    });

    // 调用Qwen3-VL
    const response = await openai.chat.completions.create({
      model: 'qwen3-vl-plus',
      messages: [{
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: image } },
          { type: 'text', text: prompt }
        ]
      }],
      stream: false
    });

    const answer = response.choices[0].message.content;
    
    console.log('[Vercel API] VLM返回:', answer);

    return res.json({
      success: true,
      text: answer,
      data: {
        hasCat: answer.includes('猫'),
        confidence: 0.9,
        timestamp: Date.now()
      }
    });

  } catch (error) {
    console.error('[Vercel API] 错误:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
