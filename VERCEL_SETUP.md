# Vercel部署指南 - VLM集成

## 📋 前置要求

- Vercel账号
- GitHub仓库
- 魔搭API Key: `sk-cde015eb16df460cbcc87f712ba4dd65`

---

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

这会安装：
- `openai`: 用于调用魔搭Qwen3-VL API

### 2. 本地测试

#### 安装Vercel CLI
```bash
npm install -g vercel
```

#### 创建本地环境变量
创建 `.env` 文件（不要提交到git）：
```bash
DASHSCOPE_API_KEY=sk-cde015eb16df460cbcc87f712ba4dd65
```

#### 启动本地开发服务器
```bash
vercel dev
```

访问：`http://localhost:3000/play.html` 或 `http://localhost:3000/debug.html`

---

## 📤 部署到Vercel

### 方式1：通过GitHub自动部署（推荐）

#### 步骤1：提交代码
```bash
git add .
git commit -m "Add VLM Vercel Serverless function"
git push
```

#### 步骤2：在Vercel中导入项目
1. 访问 https://vercel.com
2. 点击 "Import Project"
3. 选择你的GitHub仓库
4. 点击 "Import"

#### 步骤3：配置环境变量
在Vercel项目设置中：
1. 进入 **Settings** → **Environment Variables**
2. 添加：
   ```
   Name: DASHSCOPE_API_KEY
   Value: sk-cde015eb16df460cbcc87f712ba4dd65
   Environment: Production, Preview, Development
   ```
3. 点击 **Save**

#### 步骤4：重新部署
配置环境变量后，触发新的部署：
```bash
git commit --allow-empty -m "Trigger redeploy"
git push
```

### 方式2：通过CLI部署

```bash
# 首次部署
vercel

# 生产环境部署
vercel --prod
```

---

## 🧪 测试

### 本地测试
```bash
# 终端1: 启动Vercel开发服务器
vercel dev

# 终端2: 或使用普通HTTP服务器
python -m http.server 3000

# 浏览器访问
open http://localhost:3000/debug.html
```

### 测试VLM API端点
```bash
# 本地
curl -X POST http://localhost:3000/api/qwen3vl \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQ...",
    "prompt": "描述这张图片"
  }'

# 生产环境
curl -X POST https://your-project.vercel.app/api/qwen3vl \
  -H "Content-Type: application/json" \
  -d '{
    "image": "https://example.com/cat.jpg",
    "prompt": "描述这张图片"
  }'
```

---

## 📊 项目结构

```
mewt_quick_model/
├── api/
│   └── qwen3vl.js          # Vercel Serverless函数
├── play.html               # 主页面
├── debug.html              # 调试页面
├── vlm-manager.js          # VLM管理器（自动调用/api/qwen3vl）
├── mewt.js                 # Mewt核心
├── package.json            # 依赖配置
├── vercel.json             # Vercel配置
└── .env                    # 本地环境变量（不提交）
```

---

## 🔧 工作原理

```
浏览器 (play.html)
    ↓
vlm-manager.js
    ↓ fetch('/api/qwen3vl')
Vercel Serverless (api/qwen3vl.js)
    ↓
魔搭Qwen3-VL API
    ↓
返回结果
```

**优势**：
- ✅ 无CORS问题（同域名）
- ✅ API Key安全（服务器端）
- ✅ 自动扩展（Serverless）
- ✅ 免费额度充足

---

## 🐛 故障排查

### 问题1：API返回500错误
**检查**：
1. 环境变量是否正确设置
2. Vercel日志：`vercel logs`
3. API Key是否有效

### 问题2：本地开发API调用失败
**解决**：
```bash
# 确保使用vercel dev而不是普通HTTP服务器
vercel dev
```

### 问题3：生产环境API不工作
**检查**：
1. 环境变量是否在Vercel中配置
2. 是否重新部署了项目
3. 查看Vercel函数日志

---

## 📝 环境变量说明

| 变量名 | 说明 | 示例 |
|--------|------|------|
| `DASHSCOPE_API_KEY` | 魔搭API密钥 | `sk-cde015eb16df460cbcc87f712ba4dd65` |

---

## 🔒 安全注意事项

1. **不要**将`.env`文件提交到Git
2. **不要**在前端代码中硬编码API Key
3. **务必**在Vercel中配置环境变量
4. **建议**定期轮换API Key

---

## 📚 相关文档

- [Vercel Serverless Functions](https://vercel.com/docs/functions)
- [魔搭Qwen3-VL文档](https://help.aliyun.com/zh/model-studio/developer-reference/qwen-vl-api)
- [OpenAI SDK文档](https://github.com/openai/openai-node)
