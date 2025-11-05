// EdgeOne Pages 专用版本 

// CORS response helpers
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function withCors(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders())) {
    h.set(k, v);
  }
  return new Response(res.body, { status: res.status, headers: h });
}

function ok(text) {
  return withCors(new Response(text, { 
    status: 200, 
    headers: { "Content-Type": "text/plain; charset=utf-8" } 
  }));
}

function json(data, status = 200) {
  return withCors(new Response(JSON.stringify(data), { 
    status, 
    headers: { "Content-Type": "application/json" } 
  }));
}

function badRequest(message) {
  return json({ error: message }, 400);
}

// 分离的ASR调用函数
async function continueASR(ossUrl, model, language, prompt, enableITN, dashKey) {
  console.log("开始ASR调用:", ossUrl);

  const asrOptions = {
    enable_lid: true,
    enable_itn: enableITN,
  };
  
  if (language !== "auto") {
    asrOptions.language = language;
  }

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

  console.log("调用DashScope ASR...");
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
    console.error("ASR调用失败:", asrJSON);
    return json({ error: "ASR failed", detail: asrJSON }, 502);
  }

  const msg = asrJSON?.output?.choices?.[0]?.message;
  const text = Array.isArray(msg?.content) 
    ? (msg.content.find((x) => x?.text)?.text || "") 
    : "";

  console.log("ASR识别成功:", text);
  return json({ text });
}

// DashScope处理 - EdgeOne Pages兼容版本
async function handleDashscope({ file, language, prompt, modelRaw, enableITN, dashKey }) {
  try {
    const model = (modelRaw || "").replace(/:itn$/i, "") || "paraformer-realtime-8k-v1";
    
    console.log(`DashScope请求 - 模型: ${model}, 语言: ${language}`);
    console.log("文件信息:", { name: file.name, size: file.size, type: file.type });
    
    // 1. 获取上传策略
    const policyUrl = `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`;
    const policyResp = await fetch(policyUrl, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${dashKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!policyResp.ok) {
      const errorText = await policyResp.text();
      console.error("获取策略失败:", errorText);
      return json({ error: "getPolicy failed", detail: errorText }, 502);
    }

    const policyData = await policyResp.json();
    const policy = policyData?.data;
    
    if (!policy) {
      return json({ error: "invalid policy response", detail: policyData }, 502);
    }

    console.log("策略获取成功:", {
      upload_host: policy.upload_host,
      upload_dir: policy.upload_dir,
      hasKey: !!policy.oss_access_key_id
    });

    // 2. 上传文件 - 尝试多种方法
    const uploadDir = (policy.upload_dir || "").replace(/\/+$/, "");
    const fileExt = file.name.split('.').pop() || 'wav';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const key = uploadDir ? `${uploadDir}/${timestamp}_${randomId}.${fileExt}` : `${timestamp}_${randomId}.${fileExt}`;

    console.log("准备上传到:", key);
    let uploadHost = policy.upload_host;
    if (!uploadHost.startsWith('http')) {
      uploadHost = `https://${uploadHost}`;
    }

    // 方法1: 尝试标准FormData
    try {
      console.log("尝试方法1: 标准FormData");
      const formData = new FormData();
      
      formData.append("OSSAccessKeyId", policy.oss_access_key_id);
      formData.append("policy", policy.policy);
      formData.append("Signature", policy.signature);
      formData.append("key", key);
      
      if (policy.x_oss_object_acl) {
        formData.append("x-oss-object-acl", policy.x_oss_object_acl);
      }
      if (policy.x_oss_forbid_overwrite) {
        formData.append("x-oss-forbid-overwrite", policy.x_oss_forbid_overwrite);
      }
      if (policy.x_oss_security_token) {
        formData.append("x-oss-security-token", policy.x_oss_security_token);
      }
      
      formData.append("success_action_status", "200");
      formData.append("file", file, file.name);

      const ossResp = await fetch(uploadHost, {
        method: "POST",
        body: formData
      });

      console.log("方法1响应状态:", ossResp.status, ossResp.statusText);

      if (ossResp.ok) {
        const ossUrl = `oss://${key}`;
        console.log("方法1成功: OSS上传成功:", ossUrl);
        return await continueASR(ossUrl, model, language, prompt, enableITN, dashKey);
      } else {
        const errorText = await ossResp.text();
        console.error("方法1失败:", errorText);
        throw new Error("FormData failed");
      }
      
    } catch (formError) {
      console.log("标准FormData失败，尝试方法2: 手动构建multipart");
      
      // 方法2: 手动构建multipart (更兼容)
      const boundary = `----WebKitFormBoundary${Date.now()}`;
      const multipartArray = [];

      // 严格按照OSS顺序添加字段
      const fieldOrder = [
        { name: "OSSAccessKeyId", value: policy.oss_access_key_id },
        { name: "policy", value: policy.policy },
        { name: "Signature", value: policy.signature },
        { name: "key", value: key }
      ];

      for (const field of fieldOrder) {
        multipartArray.push(`--${boundary}`);
        multipartArray.push(`Content-Disposition: form-data; name="${field.name}"`);
        multipartArray.push(``);
        multipartArray.push(field.value);
      }

      // 可选字段
      if (policy.x_oss_object_acl) {
        multipartArray.push(`--${boundary}`);
        multipartArray.push(`Content-Disposition: form-data; name="x-oss-object-acl"`);
        multipartArray.push(``);
        multipartArray.push(policy.x_oss_object_acl);
      }
      
      if (policy.x_oss_forbid_overwrite) {
        multipartArray.push(`--${boundary}`);
        multipartArray.push(`Content-Disposition: form-data; name="x-oss-forbid-overwrite"`);
        multipartArray.push(``);
        multipartArray.push(policy.x_oss_forbid_overwrite);
      }
      
      if (policy.x_oss_security_token) {
        multipartArray.push(`--${boundary}`);
        multipartArray.push(`Content-Disposition: form-data; name="x-oss-security-token"`);
        multipartArray.push(``);
        multipartArray.push(policy.x_oss_security_token);
      }

      multipartArray.push(`--${boundary}`);
      multipartArray.push(`Content-Disposition: form-data; name="success_action_status"`);
      multipartArray.push(``);
      multipartArray.push("200");

      // 文件字段
      multipartArray.push(`--${boundary}`);
      multipartArray.push(`Content-Disposition: form-data; name="file"; filename="${file.name}"`);
      multipartArray.push(`Content-Type: ${file.type || "application/octet-stream"}`);
      multipartArray.push(``);

      // 构建完整数据
      const multipartText = multipartArray.join("\r\n") + "\r\n";
      const endBoundary = `\r\n--${boundary}--\r\n`;

      const fileBuffer = await file.arrayBuffer();
      const fileBytes = new Uint8Array(fileBuffer);
      
      const textEncoder = new TextEncoder();
      const textBytes = textEncoder.encode(multipartText);
      const endBytes = textEncoder.encode(endBoundary);

      const totalLength = textBytes.length + fileBytes.length + endBytes.length;
      const finalData = new Uint8Array(totalLength);

      finalData.set(textBytes, 0);
      finalData.set(fileBytes, textBytes.length);
      finalData.set(endBytes, textBytes.length + fileBytes.length);

      console.log("手动multipart构建完成，大小:", totalLength);

      const ossResp = await fetch(uploadHost, {
        method: "POST",
        headers: {
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
          "Content-Length": totalLength.toString()
        },
        body: finalData
      });

      console.log("方法2响应状态:", ossResp.status, ossResp.statusText);

      if (!ossResp.ok) {
        const errorText = await ossResp.text();
        console.error("方法2也失败:", errorText);
        return json({ error: "OSS upload failed", detail: errorText }, 502);
      }

      const ossUrl = `oss://${key}`;
      console.log("方法2成功: OSS上传成功:", ossUrl);
      return await continueASR(ossUrl, model, language, prompt, enableITN, dashKey);
    }

  } catch (error) {
    console.error("DashScope处理异常:", error);
    return json({ error: "processing failed", detail: error.message }, 500);
  }
}

// 主入口函数 - EdgeOne Pages
export default async function onRequest(context) {
  globalThis.context = context; // 保存context供全局使用
  const request = context.request;
  
  console.log("EdgeOne Pages函数被调用:", request.method, request.url);
  
  try {
    // CORS预检
    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    const url = new URL(request.url);
    console.log("请求路径:", url.pathname);

    // 健康检查
    if (url.pathname === "/v1/audio/healthz") {
      return ok("ok");
    }

    // 调试端点
    if (url.pathname === "/v1/audio/debug") {
      return json({ 
        message: "EdgeOne Pages Debug Info",
        timestamp: new Date().toISOString(),
        pathname: url.pathname,
        method: request.method,
        status: "running"
      });
    }

    // 主要的转录API
    if (url.pathname === "/v1/audio/transcriptions") {
      if (request.method !== "POST") {
        return badRequest("method must be POST");
      }

      console.log("开始处理转录请求");

      // 解析表单数据
      let form;
      try {
        form = await request.formData();
        console.log("表单数据解析成功");
      } catch (e) {
        console.error("表单解析失败:", e);
        return badRequest(`failed to parse form: ${e.message}`);
      }

      const file = form.get("file");
      if (!file || typeof file.name !== 'string') {
        console.error("文件字段缺失或无效");
        return badRequest("missing or invalid file field");
      }

      console.log("文件信息:", {
        name: file.name,
        size: file.size,
        type: file.type
      });

      const language = form.get("language")?.toString() || "auto";
      const prompt = form.get("prompt")?.toString() || "";
      const modelRaw = form.get("model")?.toString() || "";
      const upstreamUrl = form.get("upstream_url")?.toString() || "";
      const customKey = form.get("custom_key")?.toString() || "";
      const customHeader = form.get("custom_header")?.toString() || "";
      const enableITN = modelRaw.toLowerCase().includes(":itn");

      console.log("参数:", { language, model: modelRaw, hasPrompt: !!prompt, enableITN, hasCustomKey: !!customKey, hasCustomHeader: !!customHeader });

      // 检查是否为自定义代理
      if (customHeader !== "" || customKey !== "") {
        console.log("使用自定义代理服务");
        return await handleCustomProxy({ file, language, prompt, upstreamUrl, customKey, customHeader, model: modelRaw });
      }

      // 检查API Key
      const auth = request.headers.get("Authorization") || request.headers.get("authorization");
      const dashKey = auth && auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";

      if (dashKey) {
        console.log("使用DashScope服务");
        return await handleDashscope({ file, language, prompt, modelRaw, enableITN, dashKey });
      } else {
        console.log("使用Z.ai代理服务");
        return await handleZaiProxy({ file, language, prompt, upstreamUrl, model: modelRaw });
      }
    }

    // 404响应
    console.log("未找到匹配的路由:", url.pathname);
    return json({ error: "not found" }, 404);

  } catch (error) {
    console.error("函数执行异常:", error);
    return json({ 
      error: "internal server error", 
      detail: error.message 
    }, 500);
  }
}

// Z.ai代理处理函数
async function handleZaiProxy({ file, language, prompt, upstreamUrl, model }) {
  try {
    console.log("开始Z.ai代理处理");
    
    // 优先使用前端传递的代理地址，如果没有则使用环境变量
    const ctx = globalThis.context || {};
    const upstreamEndpoint = upstreamUrl || ctx.env?.UPSTREAM_ASR_ENDPOINT;
    
    if (!upstreamEndpoint) {
      return json({ 
        error: "upstream URL required", 
        detail: "请提供Z.ai代理地址或配置环境变量" 
      }, 400);
    }
    
    console.log("代理地址来源:", upstreamUrl ? "前端输入" : "环境变量");
    console.log("Z.ai代理地址:", upstreamEndpoint);
    
    // 转换为OpenAI兼容格式，但内部仍调用Z.ai API
    // OpenAI格式使用multipart/form-data，但Z.ai需要JSON格式
    console.log("转换OpenAI格式到Z.ai API格式");
    
    // 将文件转换为base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    // 构建Z.ai API需要的JSON格式
    const zaiRequestBody = {
      audio_file: {
        data: base64,
        name: file.name,
        type: file.type || "audio/wav",
        size: file.size
      },
      context: prompt || "",
      language: language === "auto" ? "zh" : language,
      enable_itn: enableITN,
      model: modelRaw || undefined // 如果有模型参数则传递
    };
    
    console.log("发送请求到Z.ai代理");
    console.log("请求详情:", {
      url: upstreamEndpoint,
      method: "POST",
      file: { name: file.name, size: file.size, type: file.type },
      language,
      hasPrompt: !!prompt,
      enableITN,
      bodySize: JSON.stringify(zaiRequestBody).length
    });
    
    const response = await fetch(upstreamEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(zaiRequestBody)
    });
    
    console.log("Z.ai代理响应状态:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Z.ai代理请求失败:", errorText);
      return json({ 
        error: "Z.ai proxy request failed", 
        detail: `HTTP ${response.status}: ${errorText}` 
      }, 502);
    }
    
    const result = await response.json();
    console.log("Z.ai代理响应成功");
    
    // 转换Z.ai响应为OpenAI兼容格式
    // Z.ai格式: { success: true, data: ["识别文本", "语言检测结果"] }
    // OpenAI格式: { text: "识别文本" }
    let openaiResponse;
    if (result.success && Array.isArray(result.data) && result.data[0]) {
      openaiResponse = { text: result.data[0] };
      console.log("Z.ai识别结果:", result.data[0]);
    } else {
      console.error("Z.ai响应格式异常:", result);
      openaiResponse = { text: "" };
    }
    
    return json(openaiResponse);
    
  } catch (error) {
    console.error("Z.ai代理处理异常:", error);
    return json({ 
      error: "Z.ai proxy processing failed", 
      detail: error.message 
    }, 500);
  }
}

// 自定义代理处理函数
async function handleCustomProxy({ file, language, prompt, upstreamUrl, customKey, customHeader, model }) {
  try {
    console.log("开始自定义代理处理");
    
    // 使用前端传递的代理地址
    if (!upstreamUrl) {
      return json({ 
        error: "upstream URL required", 
        detail: "请提供自定义代理地址" 
      }, 400);
    }
    
    console.log("自定义代理地址:", upstreamUrl);
    console.log("认证方式:", customHeader, "有API Key:", !!customKey);
    
    // 构建请求头
    const headers = {
      "Content-Type": "application/json"
    };
    
    // 根据选择的认证方式添加认证头
    if (customKey && customHeader !== "none") {
      if (customHeader === "Authorization") {
        headers["Authorization"] = `Bearer ${customKey}`;
      } else if (customHeader === "X-API-Key") {
        headers["X-API-Key"] = customKey;
      }
    }
    
    // 构建标准的OpenAI multipart/form-data请求
    // 注意：EdgeOne Pages环境中需要手动构建multipart数据
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const multipartArray = [];

    // 文件字段
    multipartArray.push(`--${boundary}`);
    multipartArray.push(`Content-Disposition: form-data; name="file"; filename="${file.name}"`);
    multipartArray.push(`Content-Type: ${file.type || "audio/wav"}`);
    multipartArray.push(``);

    // 读取文件数据
    const fileBuffer = await file.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // 模型字段
    multipartArray.push(`--${boundary}`);
    multipartArray.push(`Content-Disposition: form-data; name="model"`);
    multipartArray.push(``);
    multipartArray.push(model || "whisper-1");

    // 语言字段（如果不是auto）
    if (language !== "auto") {
      multipartArray.push(`--${boundary}`);
      multipartArray.push(`Content-Disposition: form-data; name="language"`);
      multipartArray.push(``);
      multipartArray.push(language);
    }

    // 提示字段（如果有）
    if (prompt) {
      multipartArray.push(`--${boundary}`);
      multipartArray.push(`Content-Disposition: form-data; name="prompt"`);
      multipartArray.push(``);
      multipartArray.push(prompt);
    }

    // 构建完整数据
    const multipartText = multipartArray.join("\r\n") + "\r\n";
    const endBoundary = `\r\n--${boundary}--\r\n`;

    const textEncoder = new TextEncoder();
    const textBytes = textEncoder.encode(multipartText);
    const endBytes = textEncoder.encode(endBoundary);

    const totalLength = textBytes.length + fileBytes.length + endBytes.length;
    const finalData = new Uint8Array(totalLength);

    finalData.set(textBytes, 0);
    finalData.set(fileBytes, textBytes.length);
    finalData.set(endBytes, textBytes.length + fileBytes.length);

    // 设置正确的Content-Type
    headers["Content-Type"] = `multipart/form-data; boundary=${boundary}`;

    console.log("发送请求到自定义代理");
    console.log("请求详情:", {
      url: upstreamUrl,
      method: "POST",
      file: { name: file.name, size: file.size, type: file.type },
      model: model || "whisper-1",
      language,
      hasPrompt: !!prompt
    });

    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: headers,
      body: finalData
    });
    
    console.log("自定义代理响应状态:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("自定义代理请求失败:", errorText);
      return json({ 
        error: "Custom proxy request failed", 
        detail: `HTTP ${response.status}: ${errorText}` 
      }, 502);
    }
    
    const responseText = await response.text();
    console.log("自定义代理响应内容类型:", response.headers.get("content-type"));
    console.log("自定义代理响应前100字符:", responseText.substring(0, 100));
    
    let result;
    try {
      result = JSON.parse(responseText);
      console.log("自定义代理响应成功 (JSON格式)");
    } catch (e) {
      console.error("响应不是JSON格式，可能是HTML错误页面:", e.message);
      return json({ 
        error: "Invalid response format", 
        detail: `服务返回了HTML响应而不是JSON。响应内容: ${responseText.substring(0, 200)}...` 
      }, 502);
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
    
    return json(openaiResponse);
    
  } catch (error) {
    console.error("自定义代理处理异常:", error);
    return json({ 
      error: "Custom proxy processing failed", 
      detail: error.message 
    }, 500);
  }
}