const OpenAI = require('openai');

module.exports = async function handler(req, res) {
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

    console.log('[Kimi API] 收到VLM请求');

    // 初始化Kimi客户端
    const client = new OpenAI({
      apiKey: process.env.MOONSHOT_API_KEY,
      baseURL: 'https://api.moonshot.cn/v1'
    });

    // 调用Kimi VLM
    const completion = await client.chat.completions.create({
      model: 'moonshot-v1-8k-vision-preview',
      messages: [
        {
          role: 'system',
          content: '你是一个专业的图像分析助手。请简洁准确地描述图片内容，特别关注是否有猫。'
        },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: image } },
            { type: 'text', text: prompt }
          ]
        }
      ],
      temperature: 0.6
    });

    const answer = completion.choices[0].message.content;
    
    console.log('[Kimi API] VLM返回:', answer);

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
    console.error('[Kimi API] 错误:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
