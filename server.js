const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

// 导入EdgeOne Pages函数逻辑
const fs = require('fs');
const transcriptionsPath = path.join(__dirname, 'edge-functions', 'v1', 'audio', 'transcriptions.js');

// 创建Express应用
const app = express();
const PORT = 8888;

// 中间件
app.use(cors());
app.use(express.json());
app.use(express.static('.'));

// 配置multer用于文件上传
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB limit
  }
 });

// 辅助函数 - 从EdgeOne Pages函数复制
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function withCors(res) {
  for (const [k, v] of Object.entries(corsHeaders())) {
    res.set(k, v);
  }
  return res;
}

function ok(text, contentType = "text/plain; charset=utf-8") {
  return withCors(express.response.status(200).set('Content-Type', contentType).send(text));
}

function json(data, status = 200) {
  return withCors(express.response.status(status).json(data));
}

function badRequest(message) {
  return json({ error: message }, 400);
}

// 读取EdgeOne Pages函数代码
let edgeFunctionHandler = null;
try {
  if (fs.existsSync(transcriptionsPath)) {
    const functionCode = fs.readFileSync(transcriptionsPath, 'utf8');
    
    // 创建一个模拟的context
    const mockContext = {
      env: process.env
    };
    
    // 由于EdgeOne Pages函数使用了export语法，我们需要适配
    console.log('EdgeOne Pages 函数代码已加载');
  } else {
    console.error('找不到transcriptions.js文件');
  }
} catch (error) {
  console.error('加载EdgeOne Pages函数失败:', error);
}

// 健康检查
app.get('/healthz', (req, res) => {
  res.send('ok');
});

app.get('/v1/audio/healthz', (req, res) => {
  res.send('ok');
});

app.get('/v1/audio/debug', (req, res) => {
  res.json({
    message: "Debug info",
    timestamp: new Date().toISOString(),
    pathname: req.path,
    method: req.method
  });
});

// 兼容OpenAI的转录API
app.post('/v1/audio/transcriptions', upload.single('file'), async (req, res) => {
  try {
    console.log('收到转录请求');
    
    if (!req.file) {
      return res.status(400).json({ error: "missing required file field" });
    }

    const { language = "auto", prompt = "", model = "" } = req.body;
    
    // 传递模型参数给代理函数
    const finalModel = model;
    
    // 获取Authorization header
    const auth = req.headers.authorization || req.headers.Authorization;
    const dashKey = auth && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    
    // 检查是否为自定义代理（提前获取参数）
    const customKey = req.body.custom_key;
    const customHeader = req.body.custom_header;
    const hasCustomKey = customKey && customHeader !== 'none';
    
    console.log('调试信息:', {
      customKey: !!customKey,
      customHeader: customHeader,
      hasCustomKey,
      'customKey值': customKey,
      'customHeader值': customHeader
    });
    
    console.log('参数:', {
      language,
      prompt,
      model: finalModel,
      hasApiKey: !!dashKey || hasCustomKey,
      hasDashScopeKey: !!dashKey,
      hasCustomKey,
      fileName: req.file.originalname,
      fileSize: req.file.size
    });

    // 创建一个模拟的Request对象，传递给EdgeOne Pages函数
    const mockRequest = {
      method: 'POST',
      url: `http://localhost:${PORT}/v1/audio/transcriptions`,
      headers: req.headers,
      formData: async () => {
        const formData = new FormData();
        formData.append('file', new Blob([req.file.buffer]), req.file.originalname);
        formData.append('language', language);
        formData.append('prompt', prompt);
        if (model) formData.append('model', model);
        return formData;
      }
    };

    if (customKey || customHeader) {
      // 使用自定义代理服务
      const upstreamUrl = req.body.upstream_url;
      return await handleCustomProxyLocally(req.file, language, prompt, upstreamUrl, customKey, customHeader, finalModel, res);
    }

    // 如果有API Key，使用DashScope
    if (dashKey) {
      // 这里我们直接调用DashScope逻辑
      return await handleDashscopeLocally(req.file, language, prompt, model, dashKey, res);
    } else {
      // 使用Z.ai代理服务
      const upstreamUrl = req.body.upstream_url;
      return await handleZaiProxyLocally(req.file, language, prompt, upstreamUrl, finalModel, res);
    }

  } catch (error) {
    console.error('转录请求失败:', error);
    res.status(500).json({ 
      error: "internal server error", 
      detail: error.message 
    });
  }
});

// 本地DashScope处理函数
async function handleDashscopeLocally(file, language, prompt, modelRaw, dashKey, res) {
  try {
    const model = (modelRaw || "").replace(/:itn$/i, "") || "qwen3-asr-flash";
    const enableITN = modelRaw.includes(":itn");

    console.log(`使用DashScope模型: ${model}, ITN: ${enableITN}`);

    // 1) 获取临时上传策略
    const policyUrl = `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`;
    console.log('获取上传策略:', policyUrl);

    const policyResp = await fetch(policyUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${dashKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!policyResp.ok) {
      const errorText = await policyResp.text();
      console.error('获取策略失败:', errorText);
      return res.status(502).json({ 
        error: "getPolicy failed", 
        detail: errorText 
      });
    }

    const policyJSON = await policyResp.json();
    const policy = policyJSON?.data;
    
    if (!policy) {
      return res.status(502).json({ 
        error: "invalid getPolicy response", 
        detail: policyJSON 
      });
    }

    console.log('策略获取成功:', {
      upload_host: policy.upload_host,
      upload_dir: policy.upload_dir,
      hasKeyId: !!policy.oss_access_key_id
    });

    // 2) 上传文件到OSS
    const uploadDir = (policy.upload_dir || "").replace(/\/+$/, "");
    const fileExt = file.originalname.split('.').pop() || 'wav';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const finalKey = uploadDir ? `${uploadDir}/${timestamp}_${randomId}.${fileExt}` : `${timestamp}_${randomId}.${fileExt}`;

    // 构建FormData
    const formData = new FormData();
    formData.append("OSSAccessKeyId", policy.oss_access_key_id);
    formData.append("policy", policy.policy);
    formData.append("Signature", policy.signature);
    formData.append("key", finalKey);
    
    if (policy.x_oss_object_acl !== undefined && policy.x_oss_object_acl !== null) {
      formData.append("x-oss-object-acl", policy.x_oss_object_acl);
    }
    if (policy.x_oss_forbid_overwrite !== undefined && policy.x_oss_forbid_overwrite !== null) {
      formData.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
    }
    if (policy.x_oss_security_token !== undefined && policy.x_oss_security_token !== null) {
      formData.append("x-oss-security-token", policy.x_oss_security_token);
    }
    
    formData.append("success_action_status", "200");
    formData.append("file", new Blob([file.buffer]), file.originalname);

    let uploadHost = policy.upload_host;
    if (!uploadHost.startsWith('http')) {
      uploadHost = `https://${uploadHost}`;
    }

    console.log('上传文件到OSS:', uploadHost);

    const ossResp = await fetch(uploadHost, {
      method: "POST",
      body: formData
    });

    if (!ossResp.ok) {
      const errorText = await ossResp.text();
      console.error('OSS上传失败:', errorText);
      return res.status(502).json({ 
        error: "OSS upload failed", 
        detail: errorText 
      });
    }

    const ossUrl = `oss://${finalKey}`;
    console.log('文件上传成功:', ossUrl);

    // 3) 调用DashScope ASR
    const asrOptions = {
      enable_lid: true,
      enable_itn: enableITN,
      ...(language !== "auto" ? { language } : {}),
    };

    const body = {
      model,
      input: {
        messages: [
          { role: "system", content: [{ text: prompt || "" }] },
          { role: "user", content: [{ audio: ossUrl }] },
        ],
      },
      parameters: {
        asr_options: asrOptions,
      },
    };

    console.log('调用DashScope ASR...');

    const asrResp = await fetch(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${dashKey}`,
          "Content-Type": "application/json",
          "X-DashScope-OssResourceResolve": "enable",
        },
        body: JSON.stringify(body),
      }
    );

    const asrJSON = await asrResp.json();
    
    if (!asrResp.ok) {
      console.error('ASR调用失败:', asrJSON);
      return res.status(502).json({ 
        error: "ASR not ok", 
        detail: asrJSON 
      });
    }

    const msg = asrJSON?.output?.choices?.[0]?.message;
    const text = Array.isArray(msg?.content) ? (msg.content.find((x) => x?.text)?.text || "") : "";

    console.log('ASR识别成功:', text);

    return res.status(200).json({ text });

  } catch (error) {
    console.error('DashScope处理失败:', error);
    return res.status(500).json({ 
      error: "DashScope processing failed", 
      detail: error.message 
    });
  }
}

// 启动服务器
app.listen(PORT, () => {
  console.log(`\n🚀 Qwen3 语音识别服务已启动!`);
  console.log(`📍 服务地址: http://localhost:${PORT}`);
  console.log(`🎙️  API端点: http://localhost:${PORT}/v1/audio/transcriptions`);
  console.log(`🌐 Web界面: http://localhost:${PORT}/index.html`);
  console.log(`❤️  健康检查: http://localhost:${PORT}/healthz`);
  console.log('\n请在浏览器中打开 index.html 开始使用!\n');
});

// 本地Z.ai代理处理函数
async function handleZaiProxyLocally(file, language, prompt, upstreamUrl, model, res) {
  try {
    console.log('本地Z.ai代理处理');
    
    // 优先使用前端传递的代理地址，如果没有则使用环境变量
    const upstreamEndpoint = upstreamUrl || process.env.UPSTREAM_ASR_ENDPOINT;
    
    if (!upstreamEndpoint) {
      return res.status(400).json({ 
        error: 'upstream URL required', 
        detail: '请提供Z.ai代理地址或配置环境变量' 
      });
    }
    
    console.log('代理地址来源:', upstreamUrl ? '前端输入' : '环境变量');
    console.log('Z.ai代理地址:', upstreamEndpoint);
    
    // 转换为OpenAI兼容格式，但内部仍调用Z.ai API
    console.log('转换OpenAI格式到Z.ai API格式');
    
    // 将文件转换为base64
    const base64 = Buffer.from(file.buffer).toString('base64');
    
    // 构建Z.ai API需要的JSON格式
    const zaiRequestBody = {
      audio_file: {
        data: base64,
        name: file.originalname,
        type: file.mimetype || 'audio/wav',
        size: file.size
      },
      context: prompt || '',
      language: language === 'auto' ? 'zh' : language,
      enable_itn: false,
      model: model || undefined // 如果有模型参数则传递
    };
    
    console.log('发送JSON请求到Z.ai代理');
    console.log('请求详情:', {
      url: upstreamEndpoint,
      method: 'POST',
      file: { name: file.originalname, size: file.size, type: file.mimetype },
      language,
      hasPrompt: !!prompt,
      bodySize: JSON.stringify(zaiRequestBody).length
    });
    
    const response = await fetch(upstreamEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(zaiRequestBody)
    });
    
    console.log('Z.ai代理响应状态:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Z.ai代理请求失败:', errorText);
      return res.status(502).json({ 
        error: 'Z.ai proxy request failed', 
        detail: `HTTP ${response.status}: ${errorText}` 
      });
    }
    
    const result = await response.json();
    console.log('Z.ai代理响应成功');
    
    // 转换Z.ai响应为OpenAI兼容格式
    let openaiResponse;
    if (result.success && Array.isArray(result.data) && result.data[0]) {
      openaiResponse = { text: result.data[0] };
      console.log('Z.ai识别结果:', result.data[0]);
    } else {
      console.error('Z.ai响应格式异常:', result);
      openaiResponse = { text: '' };
    }
    
    return res.status(200).json(openaiResponse);
    
  } catch (error) {
    console.error('本地Z.ai代理处理失败:', error);
    return res.status(500).json({ 
      error: 'Z.ai proxy processing failed', 
      detail: error.message 
    });
  }
}

// 本地自定义代理处理函数
async function handleCustomProxyLocally(file, language, prompt, upstreamUrl, customKey, customHeader, model, res) {
  try {
    console.log('本地自定义代理处理');
    
    if (!upstreamUrl) {
      return res.status(400).json({ 
        error: 'upstream URL required', 
        detail: '请提供自定义代理地址' 
      });
    }
    
    console.log('自定义代理地址:', upstreamUrl);
    console.log('认证方式:', customHeader, '有API Key:', !!customKey);
    
    // 构建请求头
    const headers = {
      'Content-Type': 'application/json'
    };
    
    // 根据选择的认证方式添加认证头
    if (customKey && customHeader !== 'none') {
      if (customHeader === 'Authorization') {
        headers['Authorization'] = `Bearer ${customKey}`;
      } else if (customHeader === 'X-API-Key') {
        headers['X-API-Key'] = customKey;
      }
    }
    
    // 首先尝试标准OpenAI multipart/form-data格式
    const formData = new FormData();
    
    // 在Node.js环境中需要将buffer转换为合适的格式
    const fileBlob = new Blob([file.buffer], { type: file.mimetype || 'audio/wav' });
    formData.append('file', fileBlob, file.originalname);
    formData.append('model', model || 'whisper-1');
    if (language !== 'auto') formData.append('language', language);
    if (prompt) formData.append('prompt', prompt);
    
    // 移除Content-Type头，让fetch自动设置multipart/form-data边界
    const { 'Content-Type': _, ...cleanHeaders } = headers;
    
    console.log('发送请求到自定义代理（标准OpenAI格式）');
    console.log('请求详情:', {
      url: upstreamUrl,
      method: 'POST',
      file: { name: file.originalname, size: file.size, type: file.mimetype },
      model: model || 'whisper-1',
      language,
      hasPrompt: !!prompt,
      headers: Object.keys(headers)
    });
    
    let response;
    try {
      response = await fetch(upstreamUrl, {
        method: 'POST',
        headers: cleanHeaders,
        body: formData
      });
      
      console.log('自定义代理响应状态:', response.status);
      
      // 如果标准格式成功，直接返回
      if (response.ok) {
        const responseText = await response.text();
        console.log('自定义代理响应成功 (标准格式)');
        
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          console.error('响应不是JSON格式:', e.message);
          return res.status(502).json({ 
            error: 'Invalid response format', 
            detail: `服务返回了非JSON响应。响应内容: ${responseText.substring(0, 200)}...` 
          });
        }
        
        // 解析OpenAI格式响应
        let openaiResponse;
        if (result.text) {
          openaiResponse = { text: result.text };
        } else if (result.success && Array.isArray(result.data) && result.data[0]) {
          openaiResponse = { text: result.data[0] };
        } else {
          openaiResponse = { text: JSON.stringify(result) };
        }
        
        return res.status(200).json(openaiResponse);
      }
      
      // 如果标准格式失败，尝试备用JSON格式
      const errorText = await response.text();
      console.error('标准OpenAI格式失败，尝试备用JSON格式:', errorText);
      
    } catch (fetchError) {
      console.error('标准格式请求失败，尝试备用JSON格式:', fetchError.message);
    }
    
    // 备用方案：使用之前的JSON格式（向后兼容）
    console.log('使用备用JSON格式请求...');
    
    const base64 = Buffer.from(file.buffer).toString('base64');
    const fallbackBody = {
      audio_file: {
        data: base64,
        name: file.originalname,
        type: file.mimetype || 'audio/wav',
        size: file.size
      },
      context: prompt || '',
      language: language === 'auto' ? 'zh' : language,
      enable_itn: false,
      model: model || undefined
    };
    
    // 设置JSON Content-Type
    const jsonHeaders = {
      ...headers,
      'Content-Type': 'application/json'
    };
    
    response = await fetch(upstreamUrl, {
      method: 'POST',
      headers: jsonHeaders,
      body: JSON.stringify(fallbackBody)
    });
    
    console.log('备用格式响应状态:', response.status);
    
    console.log('自定义代理响应状态:', response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('自定义代理请求失败:', errorText);
      return res.status(502).json({ 
        error: 'Custom proxy request failed', 
        detail: `HTTP ${response.status}: ${errorText}` 
      });
    }
    
    const responseText = await response.text();
    console.log('自定义代理响应内容类型:', response.headers.get('content-type'));
    console.log('自定义代理响应前100字符:', responseText.substring(0, 100));
    
    let result;
    try {
      result = JSON.parse(responseText);
      console.log('自定义代理响应成功 (JSON格式)');
    } catch (e) {
      console.error('响应不是JSON格式，可能是HTML错误页面:', e.message);
      return res.status(502).json({ 
        error: 'Invalid response format', 
        detail: `服务返回了HTML响应而不是JSON。响应内容: ${responseText.substring(0, 200)}...` 
      });
    }
    
    // 尝试解析响应为OpenAI格式
    let openaiResponse;
    if (result.text) {
      // 已经是OpenAI格式
      openaiResponse = { text: result.text };
    } else if (result.success && Array.isArray(result.data) && result.data[0]) {
      // Z.ai格式
      openaiResponse = { text: result.data[0] };
    } else {
      // 其他格式，尝试提取文本
      openaiResponse = { text: JSON.stringify(result) };
    }
    
    return res.status(200).json(openaiResponse);
    
  } catch (error) {
    console.error('本地自定义代理处理失败:', error);
    return res.status(500).json({ 
      error: 'Custom proxy processing failed', 
      detail: error.message 
    });
  }
}

module.exports = app;