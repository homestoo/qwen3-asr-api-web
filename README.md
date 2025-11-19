# Qwen3 ASR 语音识别服务部署指南

## 🆕 更新日志

### v2.0.0 - EdgeOne版本重大更新
- ✨ **Spokenly兼容**：支持spokenly平台的JSON格式直接调用
- ✨ **OpenAI格式中转**：完美支持OpenAI multipart/form-data格式
- 🧠 **智能模型映射**：qwen3-asr → qwen3-asr-flash 自动映射
- 🔧 **UTF-8 BOM修复**：解决音频文件编码问题，提升识别准确率
- 🌊 **流式响应**：支持Server-Sent Events实时转录
- 🛡️ **文件验证增强**：支持16种音频格式，10MB/3分钟限制
- ⚡ **二进制优化**：修复音频传输损坏问题
- 🎯 **生产就绪**：注释调试日志，优化性能
- 📋 **模型映射规则**：
  - `qwen3-asr` → `qwen3-asr-flash`
  - `qwen3-asr:itn` → `qwen3-asr-flash:itn`

## 📋 项目概述

这是一个兼容OpenAI接口的Qwen3语音识别(ASR)服务，支持多种部署方式。提供完整的语音转文字功能，包括多语言支持、智能标点格式化，以及与OpenAI Whisper API完全兼容的接口。
 <img width="916" height="743" alt="截屏2025-11-05 19 40 54" src="https://github.com/user-attachments/assets/315e29c0-22a8-4c82-8728-20f613b22d51" />

## 🚀 快速导航

### 选择部署方式

| 部署方式 | 适用场景 | 快速开始 |
|----------|----------|----------|
| **[🔧 本地开发](#-方式一本地开发部署)** | 开发测试、快速调试 | `npm install && npm run dev` |
| **[🐳 Docker容器](#-方式二docker容器部署)** | 服务器部署、环境一致 | `./deploy.sh start` |
| **[☁️ EdgeOne Pages](#-方式三edgeone-pages云部署)** | 生产环境、免运维 | 控制台上传代码 |

### 推荐部署流程

1. **开发阶段** → [本地开发部署](#-方式一本地开发部署)
2. **测试阶段** → [Docker容器部署](#-方式二docker容器部署)  
3. **生产阶段** → [EdgeOne Pages云部署](#-方式三edgeone-pages云部署)

---


## 🎯 核心功能

- ✅ **OpenAI兼容接口**：完全兼容OpenAI的语音转录API格式
- ✅ **多服务支持**：DashScope、Z.ai代理、自定义代理三种服务
- ✅ **多种部署方式**：本地开发、Docker容器、EdgeOne Pages云部署
- ✅ **标准格式支持**：支持标准OpenAI multipart/form-data格式
- ✅ **JSON格式支持**：支持JSON格式的音频数据传输（spokenly兼容）
- ✅ **多种音频格式**：支持MP3、WAV、M4A、FLAC、OGG等16种格式
- �� **多语言支持**：中文、英文、日文、韩文自动检测
- ✅ **ITN支持**：逆文本标准化（智能标点和格式化）
- ✅ **模型映射**：智能模型映射（qwen3-asr → qwen3-asr-flash）
- ✅ **流式支持**：支持Server-Sent Events流式响应
- ✅ **文件验证**：音频文件大小限制（10MB）和时长验证（3分钟）
- ✅ **Web调试界面**：直观的音频上传和识别界面
- ✅ **完整CORS支持**：支持跨域请求
- ✅ **详细调试日志**：方便问题排查和性能监控

## 📁 项目结构

```
qwen3-asr-web/
├── edge-functions-edgeone.zip      # EdgeOne Pages部署代码压缩包
├── server.js                       # 本地开发服务器
├── index.html                      # Web主界面
├── package.json                    # 项目依赖配置
├── package-lock.json               # 依赖锁定文件
├── Dockerfile                      # Docker镜像构建文件
├── docker-compose.yml              # Docker Compose配置
├── deploy.sh                       # Docker部署脚本
├── .dockerignore                   # Docker忽略文件配置
├── .gitignore                      # Git忽略配置
└── README.md                    
```

## 🚀 部署方式选择

### 部署选项对比

| 部署方式 | 适用场景 | 优势 | 劣势 | 维护成本 |
|----------|----------|------|------|----------|
| **本地开发** | 开发测试、原型验证 | 快速调试、完全控制、零成本 | 扩展性差、需手动维护 | 高 |
| **Docker容器** | 自建服务器、云主机 | 环境一致、易于管理、可移植 | 需要运维知识、资源成本 | 中 |
| **EdgeOne Pages** | 生产环境、高可用要求 | 免运维、自动扩缩容、全球CDN | 厂商锁定、冷启动延迟 | 低 |

### 推荐部署流程

1. **开发阶段**：使用本地开发环境进行功能测试
2. **测试阶段**：使用Docker容器进行集成测试
3. **生产阶段**：使用EdgeOne Pages进行云部署

---

## 🔧 方式一：本地开发部署

### 环境准备

#### 系统要求
- **Node.js**：版本 16.0 或更高
- **npm**：版本 7.0 或更高
- **操作系统**：macOS、Windows、Linux

#### 检查环境
```bash
node --version
npm --version
```

### 安装和启动

#### 1. 安装依赖
```bash
cd qwen3-asr-web
npm install
```
#### 2. 启动开发服务器
```bash
npm run dev
```

#### 3. 验证服务
预期输出：
```
🚀 Qwen3 语音识别服务已启动!
📍 服务地址: http://localhost:8888
🎙️  API端点: http://localhost:8888/v1/audio/transcriptions

```

### 访问地址

- **Web界面**：http://localhost:8888
- **API端点**：http://localhost:8888/v1/audio/transcriptions


### 开发调试

#### 查看实时日志
服务器会输出详细的日志信息：
- 请求处理过程
- 文件上传状态
- API调用详情
- 错误信息

#### 代码热重载
修改代码后需要手动重启：
```bash
# 停止服务
Ctrl+C

# 重新启动
npm run dev
```

---

## 🐳 方式二：Docker容器部署

### 环境准备

确保系统已安装：
- **Docker**：版本 20.10 或更高
- **Docker Compose**：版本 1.29 或更高

### 快速启动

#### 方法1：使用自动化脚本（推荐）
```bash
# 启动服务
./deploy.sh start

# 查看状态
./deploy.sh status

# 查看日志
./deploy.sh logs

# 停止服务
./deploy.sh stop

# 重启服务
./deploy.sh restart
```

#### 方法2：使用Docker Compose
```bash
# 构建并启动
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

#### 方法3：使用Docker命令
```bash
# 构建镜像
docker build -t qwen3-asr:latest .

# 运行容器
docker run -d \
  --name qwen3-asr \
  -p 8888:8888 \
  qwen3-asr:latest
```

### 配置选项

#### 环境变量配置
创建 `.env` 文件：
```bash
# DashScope API Key（也可通过前端传入）
DASHSCOPE_API_KEY=your-dashscope-api-key

# Z.ai代理地址（可选）
UPSTREAM_ASR_ENDPOINT=https://your-zai-proxy.com

# 其他配置
NODE_ENV=production
PORT=8888
```

#### 端口配置
修改 `docker-compose.yml` 中的端口映射：
```yaml
services:
  qwen3-asr:
    ports:
      - "8080:8888"  # 将容器8888端口映射到主机8080端口
```

### 生产环境配置

#### 反向代理配置
使用Nginx作为反向代理：
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:8888;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # 文件上传大小限制
        client_max_body_size 100M;
    }
}
```

#### SSL证书配置
```bash
# 安装certbot
sudo apt-get install certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com
```

## ☁️ 方式三：EdgeOne Pages云部署

### 准备工作

1. **腾讯云账号**：注册腾讯云并开通EdgeOne服务
2. **API密钥**：准备DashScope API Key（格式：sk-xxx）
3. **音频文件**：准备测试用的音频文件

### 部署步骤

#### 1. 上传代码

**方法1：控制台上传**
1. 登录腾讯云EdgeOne控制台
2. 选择或创建新的Pages应用
3. 点击"上传文件"或"导入项目"
4. 上传 `edge-functions-edgeone.zip` 文件压缩包
5. 确认文件解压到正确的目录结构


#### 2. 获取访问地址

部署完成后，EdgeOne会提供一个域名：
```
https://your-app-name.pages.tencentcloud.com
```

### 访问地址

- **API端点**：`https://your-domain.com/v1/audio/transcriptions`


### 环境变量配置

在EdgeOne Pages控制台配置：
- `UPSTREAM_ASR_ENDPOINT`：Z.ai代理服务的默认地址

### ✨ EdgeOne版本新功能

#### 最新修复内容
- ✅ **Spokenly直接调用支持**：完全兼容spokenly的JSON格式请求
- ✅ **OpenAI格式中转**：支持标准OpenAI multipart/form-data格式中转
- ✅ **智能模型映射**：自动将qwen3-asr映射为qwen3-asr-flash
- ✅ **UTF-8 BOM处理**：解决音频文件编码问题，提升识别准确率
- ✅ **流式响应支持**：支持Server-Sent Events实时流式转录
- ✅ **音频文件验证**：支持16种音频格式，10MB大小限制，3分钟时长限制
- ✅ **二进制数据优化**：修复二进制音频数据传输损坏问题
- ✅ **完整调试优化**：注释调试日志，适合生产环境部署

#### 支持的音频格式
EdgeOne版本支持以下音频格式：
- **音频格式**：aac、amr、avi、aiff、flac、flv、m4a、mkv、mp3、mp4、mpeg、ogg、opus、wav、webm、wma、wmv
- **文件大小**：最大10MB
- **音频时长**：最大3分钟

#### 模型映射规则
```javascript
// 自动映射，用户无需修改代码
qwen3-asr      → qwen3-asr-flash
qwen3-asr:itn → qwen3-asr-flash:itn
qwen3-asr-flash → qwen3-asr-flash (无变化)
qwen3-asr-flash:itn → qwen3-asr-flash:itn (无变化)
```

#### Spokenly兼容性
支持spokenly平台的直接调用，无需修改现有代码：

**spokenly请求格式示例：**
```json
{
  "audio_file": {
    "data": "base64编码的音频数据",
    "name": "recording.mp3",
    "type": "audio/mpeg"
  },
  "language": "zh",
  "model": "qwen3-asr",
  "context": "会议录音"
}
```

**响应格式：**
```json
{
  "text": "识别出的文本内容"
}
```

---

## 📝 API文档

### 基础端点

| 端点 | 方法 | 功能 | 示例 |
|------|------|------|------|

| `/v1/audio/transcriptions` | POST | 语音识别 | `curl -X POST ...` |

### 语音识别API

#### 请求格式
- **方法**：POST
- **URL**：`/v1/audio/transcriptions`
- **Content-Type**：multipart/form-data 或 application/json
- **认证**：Authorization Bearer 或 X-API-Key

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| file | File/Object | 是 | - | 音频文件或base64数据 |
| audio_file | Object | 否 | - | JSON格式时的音频数据（spokenly兼容） |
| language | String | 否 | auto | 语言代码 |
| model | String | 否 | qwen3-asr-flash | 模型名称 |
| prompt | String | 否 | - | 提示词 |
| context | String | 否 | - | 上下文提示（JSON格式） |
| enable_itn | Boolean | 否 | false | 启用ITN |
| stream | Boolean | 否 | false | 启用流式响应 |
| upstream_url | String | 否 | - | Z.ai或自定义代理地址 |
| custom_key | String | 否 | - | 自定义代理API Key |
| custom_header | String | 否 | - | 认证方式 |

#### 支持的语言
- `zh`：中文
- `en`：英文
- `ja`：日文
- `ko`：韩文
- `auto`：自动检测（默认）

#### 支持的模型
- `qwen3-asr-flash`：快速识别（默认）
- `qwen3-asr`：标准识别（自动映射为qwen3-asr-flash）
- `qwen3-asr-flash:itn`：快速+ITN
- `qwen3-asr:itn`：标准+ITN（自动映射为qwen3-asr-flash:itn）
- `paraformer-realtime-8k-v1`：阿里云Paraformer模型

#### 智能模型映射
支持自动模型映射，简化使用：
- `qwen3-asr` → `qwen3-asr-flash`
- `qwen3-asr:itn` → `qwen3-asr-flash:itn`

#### 响应格式
```json
{
  "text": "识别出的文本内容"
}
```

#### 错误响应
```json
{
  "error": "错误描述",
  "detail": "详细信息"
}
```

### 使用示例

#### 1. 标准multipart格式（OpenAI兼容）
```bash
curl -X POST http://localhost:8888/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-your-dashscope-key" \
  -F "file=@audio.mp3" \
  -F "language=zh" \
  -F "model=qwen3-asr" \
  -F "prompt=这是技术讨论的录音"
```

#### 2. JSON格式（spokenly兼容）
```bash
curl -X POST http://localhost:8888/v1/audio/transcriptions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-your-dashscope-key" \
  -d '{
    "audio_file": {
      "data": "base64编码的音频数据",
      "name": "audio.mp3",
      "type": "audio/mpeg"
    },
    "language": "zh",
    "model": "qwen3-asr",
    "context": "这是技术讨论的录音"
  }'
```

#### 3. 流式响应
```bash
curl -X POST http://localhost:8888/v1/audio/transcriptions?stream=true \
  -H "Authorization: Bearer sk-your-dashscope-key" \
  -F "file=@audio.mp3" \
  -F "language=zh" \
  -F "model=qwen3-asr:itn"
```

#### JavaScript示例

**标准multipart格式：**
```javascript
const formData = new FormData();
formData.append('file', audioFile);
formData.append('language', 'zh');
formData.append('model', 'qwen3-asr'); // 自动映射为qwen3-asr-flash

const response = await fetch('http://localhost:8888/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer sk-your-dashscope-key'
  },
  body: formData
});

const result = await response.json();
console.log('识别结果:', result.text);
```

**JSON格式（spokenly兼容）：**
```javascript
// 将文件转换为base64
const base64Audio = await new Promise((resolve) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result.split(',')[1]);
  reader.readAsDataURL(audioFile);
});

const response = await fetch('http://localhost:8888/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer sk-your-dashscope-key'
  },
  body: JSON.stringify({
    audio_file: {
      data: base64Audio,
      name: audioFile.name,
      type: audioFile.type
    },
    language: 'zh',
    model: 'qwen3-asr:itn', // 自动映射为qwen3-asr-flash:itn
    context: '这是技术讨论的录音'
  })
});

const result = await response.json();
console.log('识别结果:', result.text);
```

#### Python示例
```python
import requests

url = "http://localhost:8888/v1/audio/transcriptions"
headers = {"Authorization": "Bearer sk-your-dashscope-key"}

with open("audio.mp3", "rb") as f:
    files = {"file": f}
    data = {
        "language": "zh",
        "model": "qwen3-asr-flash"
    }
    response = requests.post(url, headers=headers, files=files, data=data)
    result = response.json()
    print("识别结果:", result["text"])
```

---

## 🧪 功能测试

### 语音识别测试

#### 准备测试音频
- **支持格式**：MP3、WAV、M4A、FLAC、OGG
- **建议大小**：1-50MB
- **推荐时长**：10秒-10分钟

#### Web界面测试
1. 打开Web界面（根据部署方式选择对应地址）
2. 选择服务类型：
   - **DashScope**：输入API Key（格式：sk-xxx）
   - **Z.ai代理**：输入代理地址
   - **自定义代理**：输入代理地址、API Key和认证方式
3. 上传音频文件
4. 设置参数（语言、模型、提示词等）
5. 点击"开始语音识别"

---

## 🐛 故障排除

### 通用问题

#### 1. 端口被占用
**错误信息**：`Error: listen EADDRINUSE :::8888`

**解决方案**：
```bash
# 查找占用端口的进程
lsof -i :8888

# 杀死进程
kill -9 进程ID

# 或者使用其他端口
PORT=8080 npm run dev
```

#### 2. API Key无效
**错误信息**：`{"error":"getPolicy failed","detail":"..."}`

**解决方案**：
- 检查API Key格式是否正确（sk-开头）
- 确认DashScope账户余额充足
- 验证API Key权限设置

#### 3. 音频文件无法识别
**错误信息**：`failed to parse multipart form`

**解决方案**：
- 确认音频文件格式受支持
- 检查文件是否损坏
- 尝试使用较小的音频文件

#### 4. 识别结果为空
**原因分析**：
- 音频质量过低
- 语言设置不匹配
- 背景噪音过多

**解决方案**：
- 使用清晰的音频文件
- 设置正确的语言参数
- 添加相关提示词


### EdgeOne Pages问题

#### 1. 502 Bad Gateway
**原因**：DashScope API Key无效或网络问题

**解决**：
- 检查API Key格式是否正确（sk-开头）
- 确认DashScope账户余额充足
- 查看EdgeOne函数日志

#### 2. CORS错误
**原因**：跨域请求被阻止

**解决**：
- 检查请求头设置
- 确认EdgeOne Pages的CORS配置


### 调试方法

#### 1. 查看日志
- **本地环境**：控制台直接输出
- **Docker环境**：`docker-compose logs -f`
- **EdgeOne Pages**：控制台函数日志

#### 2. 网络测试
```bash

# 测试API格式
curl -X POST http://localhost:8888/v1/audio/transcriptions \
  -H "Content-Type: multipart/form-data" \
  -F "file=@test.mp3"
```

---


### 更新升级
```bash
# Docker环境更新
git pull
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 本地环境更新
git pull
npm install
npm run dev
```

---

