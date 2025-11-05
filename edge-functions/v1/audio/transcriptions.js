/**
 * 处理 /v1/audio/transcriptions 请求
 * @param {Object} context - EdgeOne Pages 上下文对象
 * @returns {Promise<Response>} HTTP 响应
 */
export default async function onRequest(context) {
  const request = context.request;

  // 处理 CORS 预检请求
  if (request.method === "OPTIONS") return handleOptions(request);
  
  try {
    console.log("EdgeOne Pages函数被调用:", request.method, request.url);
    
    const url = new URL(request.url);
    console.log("请求路径:", url.pathname);

    // 健康检查
    if (url.pathname === "/healthz" || url.pathname === "/v1/audio/healthz") {
      return new Response("ok", {
        status: 200,
        headers: { 
          "Content-Type": "text/plain; charset=utf-8",
          ...corsHeaders()
        }
      });
    }

    // 调试端点
    if (url.pathname === "/v1/audio/debug") {
      return new Response(JSON.stringify({
        message: "EdgeOne Pages Debug Info",
        timestamp: new Date().toISOString(),
        pathname: url.pathname,
        method: request.method,
        status: "running",
        server: "EdgeOne Pages Tencent Cloud"
      }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }

    // 主要的转录API
    if (url.pathname === "/v1/audio/transcriptions") {
      if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "method must be POST" }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders()
          }
        });
      }

      console.log("开始处理转录请求");

      try {
        // 先尝试获取请求的 Content-Type
        const contentType = request.headers.get("content-type") || "";
        console.log("=== EdgeOne Pages 请求信息 ===");
        console.log("请求 Content-Type:", contentType);
        console.log("请求 Content-Length:", request.headers.get("content-length"));
        console.log("请求 User-Agent:", request.headers.get("user-agent"));
        console.log("所有请求头:", Object.fromEntries(request.headers.entries()));
        console.log("=== 请求信息结束 ===");
        
        let file, language, prompt, modelRaw, upstreamUrl, customKey, customHeader;
        
        if (contentType.includes("application/json")) {
          // 处理 JSON 格式的请求 (spokenText 可能使用这种格式)
          console.log("处理 JSON 格式请求");
          let jsonBody;
          try {
            jsonBody = await request.json();
          } catch (jsonError) {
            console.error("JSON 解析失败:", jsonError);
            return new Response(JSON.stringify({ 
              error: "failed to parse JSON", 
              detail: jsonError.message 
            }), {
              status: 400,
              headers: {
                "Content-Type": "application/json",
                ...corsHeaders()
              }
            });
          }
          
          // 从 JSON 中提取参数
          if (jsonBody.audio_file) {
            // spokenText 可能发送 base64 编码的音频数据
            const audioData = jsonBody.audio_file;
            
            if (typeof audioData === 'string') {
              // 处理 base64 编码的音频
              const base64Data = audioData.includes('base64,') 
                ? audioData.split('base64,')[1] 
                : audioData;
              
              let binaryString;
              try {
                binaryString = atob(base64Data);
              } catch (base64Error) {
                console.error("Base64 解码失败:", base64Error);
                return new Response(JSON.stringify({ 
                  error: "failed to decode base64 audio data", 
                  detail: "Invalid base64 format" 
                }), {
                  status: 400,
                  headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders()
                  }
                });
              }
              
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              const blob = new Blob([bytes], { type: jsonBody.audio_file?.type || "audio/wav" });
              file = new File([blob], jsonBody.audio_file?.name || "audio.wav", { 
                type: jsonBody.audio_file?.type || "audio/wav" 
              });
            } else if (audioData.data) {
              // 处理包含 base64 数据的对象格式
              const base64Data = audioData.data;
              let binaryString;
              try {
                binaryString = atob(base64Data);
              } catch (base64Error) {
                console.error("Base64 解码失败:", base64Error);
                return new Response(JSON.stringify({ 
                  error: "failed to decode base64 audio data", 
                  detail: "Invalid base64 format" 
                }), {
                  status: 400,
                  headers: {
                    "Content-Type": "application/json",
                    ...corsHeaders()
                  }
                });
              }
              
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              
              const blob = new Blob([bytes], { type: audioData.type || "audio/wav" });
              file = new File([blob], audioData.name || "audio.wav", { 
                type: audioData.type || "audio/wav" 
              });
            }
          }
          
          language = jsonBody.language || "auto";
          prompt = jsonBody.prompt || jsonBody.context || "";
          modelRaw = jsonBody.model || "";
          upstreamUrl = jsonBody.upstream_url || "";
          customKey = jsonBody.custom_key || "";
          customHeader = jsonBody.custom_header || "";
          
          console.log("JSON 请求参数解析完成:", {
            hasFile: !!file,
            language,
            model: modelRaw,
            hasPrompt: !!prompt
          });
          
        } else {
          // 处理 multipart/form-data 格式请求
          console.log("处理 FormData 格式请求");
          const form = await request.formData();
          file = form.get("file");
          
          // 获取所有参数
          language = form.get("language")?.toString() || "auto";
          prompt = form.get("prompt")?.toString() || "";
          modelRaw = form.get("model")?.toString() || "";
          upstreamUrl = form.get("upstream_url")?.toString() || "";
          customKey = form.get("custom_key")?.toString() || "";
          customHeader = form.get("custom_header")?.toString() || "";
        }
        
        // 验证文件是否存在
        if (!file || typeof file.name !== 'string') {
          return new Response(JSON.stringify({ error: "missing or invalid file field" }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders()
            }
          });
        }
        
        console.log("文件信息:", {
          name: file.name,
          size: file.size,
          type: file.type
        });
        
        console.log("收到的所有参数:", {
          language,
          model: modelRaw,
          upstreamUrl,
          customKey: !!customKey,
          customHeader,
          hasPrompt: !!prompt
        });
        
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
          return await handleDashscope({ file, language, prompt, modelRaw, dashKey });
        } else if (upstreamUrl) {
          console.log("使用Z.ai代理服务");
          return await handleZaiProxy({ file, language, prompt, upstreamUrl, model: modelRaw });
        } else {
          console.log("没有配置任何服务");
          return new Response(JSON.stringify({ 
            error: "No service configured. Please provide either: 1) Authorization Bearer token for DashScope, 2) upstream_url for Z.ai proxy, or 3) custom_key and custom_header for custom proxy" 
          }), {
            status: 400,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders()
            }
          });
        }
        
      } catch (e) {
        console.error("=== 表单解析失败详细信息 ===");
        console.error("错误类型:", e.constructor.name);
        console.error("错误消息:", e.message);
        console.error("错误堆栈:", e.stack);
        console.error("Content-Type:", contentType);
        console.error("Content-Length:", request.headers.get("content-length"));
        
        // 尝试读取原始请求体进行调试
        try {
          const requestBody = await request.text();
          console.error("请求体前200字符:", requestBody.substring(0, 200));
          console.error("请求体长度:", requestBody.length);
        } catch (bodyError) {
          console.error("无法读取请求体:", bodyError.message);
        }
        
        console.error("=== 错误信息结束 ===");
        
        return new Response(JSON.stringify({ 
          error: `failed to parse form: ${e.message}`,
          debug: {
            contentType: contentType,
            contentLength: request.headers.get("content-length"),
            errorType: e.constructor.name
          }
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders()
          }
        });
      }
    }

    // 404响应
    return new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
    
  } catch (error) {
    console.error("=== 函数执行异常详细信息 ===");
    console.error("错误类型:", error.constructor.name);
    console.error("错误消息:", error.message);
    console.error("错误堆栈:", error.stack);
    console.error("请求URL:", request.url);
    console.error("请求方法:", request.method);
    console.error("请求头:", Object.fromEntries(request.headers.entries()));
    console.error("=== 异常信息结束 ===");
    
    return new Response(JSON.stringify({
      error: "internal server error",
      detail: error.message,
      debug: {
        errorType: error.constructor.name,
        url: request.url,
        method: request.method
      }
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
  }
}

// CORS 头部
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// 处理 OPTIONS 请求
function handleOptions(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders()
  });
}

// DashScope处理函数 - 修复EdgeOne Pages环境下的OSS上传
async function handleDashscope({ file, language, prompt, modelRaw, dashKey }) {
  try {
    const model = (modelRaw || "").replace(/:itn$/i, "") || "qwen3-asr-flash";
    const enableITN = modelRaw.includes(":itn");

    console.log(`DashScope请求 - 模型: ${model}, 语言: ${language}`);

    // 1. 获取上传策略
    const policyUrl = `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=${encodeURIComponent(model)}`;
    console.log("构建的Policy URL:", policyUrl);
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
      console.error("Policy URL:", policyUrl);
      console.error("Response Status:", policyResp.status);
      return new Response(JSON.stringify({ error: "getPolicy failed", detail: `Policy URL: ${policyUrl}, Error: ${errorText}` }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }

    const policyData = await policyResp.json();
    const policy = policyData?.data;
    
    if (!policy) {
      return new Response(JSON.stringify({ error: "invalid policy response", detail: policyData }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }

    console.log("策略获取成功:", {
      upload_host: policy.upload_host,
      upload_dir: policy.upload_dir,
      hasKey: !!policy.oss_access_key_id
    });

    // 2. 上传文件 - 使用手动构建multipart的方式（与server.js备用方案相同）
    const uploadDir = (policy.upload_dir || "").replace(/\/+$/, "");
    const fileExt = file.name.split('.').pop() || 'wav';
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substring(2, 8);
    const finalKey = uploadDir ? `${uploadDir}/${timestamp}_${randomId}.${fileExt}` : `${timestamp}_${randomId}.${fileExt}`;

    console.log("准备上传到:", finalKey);
    let uploadHost = policy.upload_host;
    if (!uploadHost.startsWith('http')) {
      uploadHost = `https://${uploadHost}`;
    }
    console.log("OSS上传主机:", uploadHost);
    
    if (!uploadHost) {
      return new Response(JSON.stringify({ error: "invalid upload host", detail: "Missing upload_host in policy response" }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }
    
    // 检查uploadHost是否包含路径，避免重复路径
    console.log("OSS上传策略详情:", {
      uploadHost,
      policy,
      finalKey,
      fullUrl: uploadHost
    });

    // 使用手动构建multipart的方式（与server.js方法2相同）
    console.log("使用手动构建multipart方式");
    
    const boundary = `----WebKitFormBoundary${Date.now()}`;
    const multipartArray = [];

    // 严格按照OSS顺序添加字段
    const fieldOrder = [
      { name: "OSSAccessKeyId", value: policy.oss_access_key_id },
      { name: "policy", value: policy.policy },
      { name: "Signature", value: policy.signature },
      { name: "key", value: finalKey }
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

    console.log("OSS响应状态:", ossResp.status, ossResp.statusText);

    if (!ossResp.ok) {
      const errorText = await ossResp.text();
      console.error("OSS上传失败:", errorText);
      return new Response(JSON.stringify({ error: "OSS upload failed", detail: errorText }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }

    const ossUrl = `oss://${finalKey}`;
    console.log("OSS上传成功:", ossUrl);
    return await continueASR(ossUrl, model, language, prompt, enableITN, dashKey);

  } catch (error) {
    console.error("DashScope处理异常:", error);
    return new Response(JSON.stringify({ error: "processing failed", detail: error.message }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
  }
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
    return new Response(JSON.stringify({ error: "ASR failed", detail: asrJSON }), {
      status: 502,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
  }

  const msg = asrJSON?.output?.choices?.[0]?.message;
  const text = Array.isArray(msg?.content) 
    ? (msg.content.find((x) => x?.text)?.text || "") 
    : "";

  console.log("ASR识别成功:", text);
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders()
    }
  });
}

// Z.ai代理处理函数
async function handleZaiProxy({ file, language, prompt, upstreamUrl, model }) {
  try {
    console.log("开始Z.ai代理处理");
    
    if (!upstreamUrl) {
      return new Response(JSON.stringify({ 
        error: "upstream URL required", 
        detail: "请提供Z.ai代理地址" 
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }
    
    console.log("Z.ai代理地址:", upstreamUrl);
    
    // 转换为OpenAI兼容格式，但内部仍调用Z.ai API
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
      enable_itn: model.toLowerCase().includes(":itn"),
      model: model || undefined
    };
    
    console.log("发送请求到Z.ai代理");
    
    const response = await fetch(upstreamUrl, {
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
      return new Response(JSON.stringify({ 
        error: "Z.ai proxy request failed", 
        detail: `HTTP ${response.status}: ${errorText}` 
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }
    
    const result = await response.json();
    console.log("Z.ai代理响应成功");
    
    // 转换Z.ai响应为OpenAI兼容格式
    let openaiResponse;
    if (result.success && Array.isArray(result.data) && result.data[0]) {
      openaiResponse = { text: result.data[0] };
      console.log("Z.ai识别结果:", result.data[0]);
    } else {
      console.error("Z.ai响应格式异常:", result);
      openaiResponse = { text: "" };
    }
    
    return new Response(JSON.stringify(openaiResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
    
  } catch (error) {
    console.error("Z.ai代理处理异常:", error);
    return new Response(JSON.stringify({ 
      error: "Z.ai proxy processing failed", 
      detail: error.message 
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
  }
}

// 自定义代理处理函数
async function handleCustomProxy({ file, language, prompt, upstreamUrl, customKey, customHeader, model }) {
  try {
    console.log("开始自定义代理处理");
    
    if (!upstreamUrl) {
      return new Response(JSON.stringify({ 
        error: "upstream URL required", 
        detail: "请提供自定义代理地址" 
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }
    
    // 检查URL格式
    if (!upstreamUrl.startsWith('http://') && !upstreamUrl.startsWith('https://')) {
      console.log("URL格式检查失败，添加https://前缀");
      upstreamUrl = 'https://' + upstreamUrl;
    }
    
    // 检查URL是否有效
    try {
      const urlObj = new URL(upstreamUrl);
      
      // 检查是否是EdgeOne Pages自身的地址，避免循环调用
      const currentHost = context.request.headers.get('host') || '';
      const upstreamHost = urlObj.hostname;
      
      if (upstreamHost === currentHost || upstreamHost.includes('edgeone') || upstreamHost.includes('tencentcloud')) {
        return new Response(JSON.stringify({ 
          error: "invalid upstream URL", 
          detail: `不能使用EdgeOne Pages自身的地址作为代理服务器。请使用外部API服务地址。` 
        }), {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders()
          }
        });
      }
      
    } catch (e) {
      return new Response(JSON.stringify({ 
        error: "invalid upstream URL", 
        detail: `提供的代理地址无效: ${upstreamUrl}` 
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }
    
    console.log("自定义代理地址:", upstreamUrl);
    console.log("认证方式:", customHeader, "有API Key:", !!customKey);
    console.log("请求参数详情:", {
      url: upstreamUrl,
      method: "POST",
      hasAuth: !!(customKey && customHeader !== "none"),
      authType: customHeader,
      fileName: file.name,
      fileSize: file.size,
      model: model || "whisper-1",
      language: language,
      hasPrompt: !!prompt
    });
    
    // 构建请求头
    const headers = {};
    
    // 根据选择的认证方式添加认证头
    if (customKey && customHeader !== "none") {
      if (customHeader === "Authorization") {
        headers["Authorization"] = `Bearer ${customKey}`;
      } else if (customHeader === "X-API-Key") {
        headers["X-API-Key"] = customKey;
      }
    }
    
    // 首先尝试标准OpenAI multipart/form-data格式
    try {
      console.log("尝试标准OpenAI multipart/form-data格式");
      
      // 构建标准的OpenAI multipart/form-data请求
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

      // 先测试连接
    console.log("测试代理服务器连接...");
    try {
      const testResponse = await fetch(upstreamUrl, {
        method: "GET",
        headers: headers
      });
      console.log("测试连接响应状态:", testResponse.status);
      if (testResponse.status === 405) {
        console.log("服务器不支持GET方法，这是正常的，继续POST请求");
      } else if (!testResponse.ok) {
        const testErrorText = await testResponse.text();
        console.log("测试连接失败:", testErrorText);
      }
    } catch (testError) {
      console.log("测试连接异常:", testError.message);
    }
    
    console.log("发送标准格式请求到自定义代理");
      
      let response = await fetch(upstreamUrl, {
        method: "POST",
        headers: headers,
        body: finalData
      });
      
      console.log("标准格式响应状态:", response.status);
      
      // 如果标准格式成功，直接返回
      if (response.ok) {
        const responseText = await response.text();
        console.log("自定义代理响应成功 (标准格式)");
        
        let result;
        try {
          result = JSON.parse(responseText);
        } catch (e) {
          console.error("响应不是JSON格式:", e.message);
          return new Response(JSON.stringify({ 
            error: "Invalid response format", 
            detail: `服务返回了非JSON响应。响应内容: ${responseText.substring(0, 200)}...` 
          }), {
            status: 502,
            headers: {
              "Content-Type": "application/json",
              ...corsHeaders()
            }
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
        
        return new Response(JSON.stringify(openaiResponse), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders()
          }
        });
      }
      
      // 如果标准格式失败，尝试备用JSON格式
      const errorText = await response.text();
      console.error("标准OpenAI格式失败，尝试备用JSON格式:", errorText);
      console.error("标准格式请求详情:", {
        url: upstreamUrl,
        method: "POST",
        contentType: headers["Content-Type"],
        bodySize: finalData.length,
        responseStatus: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries())
      });
      
    } catch (fetchError) {
      console.error("标准格式请求失败，尝试备用JSON格式:", fetchError.message);
    }
    
    // 备用方案：使用JSON格式（向后兼容）
    console.log("使用备用JSON格式请求...");
    
    // 将文件转换为base64
    const arrayBuffer = await file.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    
    const jsonHeaders = { ...headers };
    jsonHeaders["Content-Type"] = "application/json";
    
    const fallbackBody = {
      audio_file: {
        data: base64,
        name: file.name,
        type: file.type || "audio/wav",
        size: file.size
      },
      context: prompt || "",
      language: language === "auto" ? "zh" : language,
      enable_itn: model.toLowerCase().includes(":itn"),
      model: model || undefined
    };
    
    const response = await fetch(upstreamUrl, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(fallbackBody)
    });
    
    console.log("备用格式响应状态:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("备用JSON格式请求失败:", errorText);
      console.error("备用格式请求详情:", {
        url: upstreamUrl,
        method: "POST",
        contentType: jsonHeaders["Content-Type"],
        responseStatus: response.status,
        responseHeaders: Object.fromEntries(response.headers.entries())
      });
      
      // 提供更友好的错误信息
      let friendlyError = `HTTP ${response.status}: ${errorText}`;
      if (errorText.includes('MethodNotAllowed')) {
        // 检查是否是因为路径问题导致的
        let suggestions = [];
        
        if (upstreamUrl.endsWith('/')) {
          suggestions.push('移除URL末尾的斜杠');
        }
        
        const commonPaths = ['/api/v1/audio/transcriptions', '/v1/transcriptions', '/transcribe', '/api/transcribe'];
        for (const path of commonPaths) {
          if (!upstreamUrl.includes(path)) {
            suggestions.push(`尝试添加路径: ${path}`);
          }
        }
        
        if (upstreamUrl.split('/').length <= 3) {
          suggestions.push('URL路径过短，可能需要添加API路径前缀');
        }
        
        friendlyError = `服务器不支持POST方法。请检查代理服务器配置。
URL: ${upstreamUrl}
可能的解决方案:
${suggestions.map(s => `- ${s}`).join('\n')}
常见API路径格式:
- https://your-proxy.com/api/v1/audio/transcriptions
- https://your-proxy.com/v1/transcriptions
- https://your-proxy.com/transcribe`;
        
      } else if (errorText.includes('not found')) {
        friendlyError = `服务器返回404错误。请检查代理服务器地址和路径是否正确。URL: ${upstreamUrl}`;
      }
      
      return new Response(JSON.stringify({ 
        error: "Custom proxy request failed", 
        detail: friendlyError,
        debug: {
          url: upstreamUrl,
          method: "POST",
          status: response.status,
          errorText: errorText.substring(0, 500)
        }
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
      });
    }
    
    const responseText = await response.text();
    console.log("自定义代理响应成功");
    
    let result;
    try {
      result = JSON.parse(responseText);
      console.log("自定义代理响应成功 (JSON格式)");
    } catch (e) {
      console.error("响应不是JSON格式，可能是HTML错误页面:", e.message);
      return new Response(JSON.stringify({ 
        error: "Invalid response format", 
        detail: `服务返回了HTML响应而不是JSON。响应内容: ${responseText.substring(0, 200)}...` 
      }), {
        status: 502,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders()
        }
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
    
    return new Response(JSON.stringify(openaiResponse), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
    
  } catch (error) {
    console.error("自定义代理处理异常:", error);
    return new Response(JSON.stringify({ 
      error: "Custom proxy processing failed", 
      detail: error.message 
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders()
      }
    });
  }
}