// ============================================================
// PromptPalette Web - Cloudflare Worker 后端
// ============================================================

// --- HMAC 签名工具 ---
async function signToken(payload, secret) {
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(payload) + '.' + secret);
  const hash = await crypto.subtle.digest('SHA-256', data);
  const sig = Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(JSON.stringify(payload)) + '.' + sig;
}

async function verifyToken(token, secret) {
  try {
    const dot = token.indexOf('.');
    if (dot < 0) return null;
    const payload = JSON.parse(atob(token.slice(0, dot)));
    const sig = token.slice(dot + 1);
    const expected = await signToken(payload, secret);
    return expected === token ? payload : null;
  } catch { return null; }
}

function getCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|;)\\s*' + name + '\\s*=\\s*([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}

// --- CORS 工具（支持跨域演示站 + credentials） ---
function corsHeaders(request, extra = {}) {
  const origin = request.headers.get('Origin');
  const headers = {
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-API-URL,X-API-Key',
    ...extra
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Vary'] = 'Origin';
  } else {
    headers['Access-Control-Allow-Origin'] = '*';
  }
  return headers;
}

function applyCors(request, response) {
  const headers = new Headers(response.headers);
  const origin = request.headers.get('Origin');
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Vary', 'Origin');
  } else {
    headers.set('Access-Control-Allow-Origin', '*');
  }
  headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-URL,X-API-Key');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

// --- 响应工具 ---
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}

function error(msg, status = 400) {
  return json({ error: msg }, status);
}

// --- KV 数据键 ---
const KV_KEY_MAIN = 'main_data';
const KV_KEY_TAGS = 'tags_data';

// --- 默认数据 ---
const DEFAULT_MAIN = { tags: [], updatedAt: 0 };
const DEFAULT_TAGS = { items: [], updatedAt: 0 };

// --- 内存缓存（缓解 KV 最终一致性导致的写后读延迟） ---
// 同一 isolate 内写入后立即读取可拿到最新值；跨 isolate 由 KV 兜底
const memCache = new Map();
const CACHE_TTL_MS = 30000;

function cacheGet(key) {
  const item = memCache.get(key);
  if (item && Date.now() - item.ts < CACHE_TTL_MS) return item.value;
  return undefined;
}
function cacheSet(key, value) {
  memCache.set(key, { value, ts: Date.now() });
}

// --- 读取数据 ---
async function loadMain(env) {
  const cached = cacheGet(KV_KEY_MAIN);
  if (cached !== undefined) return cached;
  try {
    const raw = await env.KV.get(KV_KEY_MAIN, 'text');
    if (raw) {
      const parsed = JSON.parse(raw);
      cacheSet(KV_KEY_MAIN, parsed);
      return parsed;
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_MAIN));
}

async function loadTags(env) {
  const cached = cacheGet(KV_KEY_TAGS);
  if (cached !== undefined) return cached;
  try {
    const raw = await env.KV.get(KV_KEY_TAGS, 'text');
    if (raw) {
      const parsed = JSON.parse(raw);
      cacheSet(KV_KEY_TAGS, parsed);
      return parsed;
    }
  } catch {}
  return JSON.parse(JSON.stringify(DEFAULT_TAGS));
}

async function saveMain(env, data) {
  data.updatedAt = Date.now();
  cacheSet(KV_KEY_MAIN, data);
  await env.KV.put(KV_KEY_MAIN, JSON.stringify(data));
  return data;
}

async function saveTags(env, data) {
  data.updatedAt = Date.now();
  cacheSet(KV_KEY_TAGS, data);
  await env.KV.put(KV_KEY_TAGS, JSON.stringify(data));
  return data;
}

// --- 验证管理员 ---
async function isAdmin(request, env) {
  const token = getCookie(request, 'pp_admin_token');
  if (!token) return false;
  const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD || 'default_secret';
  const payload = await verifyToken(token, secret);
  return payload && payload.role === 'admin';
}

// --- 数据校验 ---
function validateMainData(data) {
  if (!data || typeof data !== 'object') return '数据格式无效';
  if (!Array.isArray(data.tags)) return 'tags 必须是数组';
  for (const tag of data.tags) {
    if (!tag.id || typeof tag.id !== 'string') return '标签缺少 id';
    if (!tag.name || typeof tag.name !== 'string' || tag.name.length > 50) return '标签名称无效（最长50字符）';
    if (!Array.isArray(tag.notes)) return '标签 notes 必须是数组';
    for (const note of tag.notes) {
      if (!note.id || typeof note.id !== 'string') return '便签缺少 id';
      if (!note.name || typeof note.name !== 'string' || note.name.length > 100) return '便签名称无效（最长100字符）';
      if (typeof note.content !== 'string' || note.content.length > 50000) return '便签内容过长（最长50000字符）';
    }
  }
  return null;
}

function validateTagsData(data) {
  if (!Array.isArray(data)) return '数据必须是数组';
  for (const item of data) {
    if (!item.id || typeof item.id !== 'string') return 'Tag 缺少 id';
    if (!item.name || typeof item.name !== 'string' || item.name.length > 100) return 'Tag name 无效';
    if (typeof item.cn_name !== 'string') item.cn_name = '';
    if (typeof item.wiki !== 'string') item.wiki = '';
  }
  return null;
}

// --- AI 工具定义 ---
function getToolDefs(isAdminUser) {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'list_tags',
        description: '查看所有标签及便签标题列表',
        parameters: { type: 'object', properties: {} }
      }
    },
    {
      type: 'function',
      function: {
        name: 'get_note_content',
        description: '查看指定便签的完整内容',
        parameters: {
          type: 'object',
          properties: { noteId: { type: 'string', description: '便签 ID' } },
          required: ['noteId']
        }
      }
    },
    {
      type: 'function',
      function: {
        name: 'search_local_tags',
        description: '搜索本地独立 Tag（按 name/cn_name/wiki 模糊匹配），支持多关键词',
        parameters: {
          type: 'object',
          properties: {
            queries: { type: 'array', items: { type: 'string' }, description: '关键词列表' },
            match_mode: { type: 'string', enum: ['any', 'all'], description: '匹配模式' }
          },
          required: ['queries']
        }
      }
    }
  ];
  
  if (isAdminUser) {
    tools.push({
      type: 'function',
      function: {
        name: 'create_note',
        description: '在指定标签下创建新便签',
        parameters: {
          type: 'object',
          properties: {
            tagId: { type: 'string', description: '标签 ID' },
            noteName: { type: 'string', description: '便签名称' },
            noteContent: { type: 'string', description: '便签内容' }
          },
          required: ['tagId', 'noteName', 'noteContent']
        }
      }
    }, {
      type: 'function',
      function: {
        name: 'delete_note',
        description: '删除指定便签',
        parameters: {
          type: 'object',
          properties: { noteId: { type: 'string', description: '便签 ID' } },
          required: ['noteId']
        }
      }
    }, {
      type: 'function',
      function: {
        name: 'create_tag',
        description: '创建独立 Tag（组合面板用）',
        parameters: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Tag 名称' },
            cn_name: { type: 'string', description: '中文名/别名' },
            wiki: { type: 'string', description: 'Wiki 说明' }
          },
          required: ['name']
        }
      }
    }, {
      type: 'function',
      function: {
        name: 'delete_tag',
        description: '删除指定独立 Tag',
        parameters: {
          type: 'object',
          properties: { tagId: { type: 'string', description: 'Tag ID' } },
          required: ['tagId']
        }
      }
    });
  }
  
  return tools;
}

// --- 执行工具调用 ---
async function executeToolCall(toolCall, mainData, tagsData, isAdminUser) {
  const fn = toolCall.function;
  const name = fn.name;
  let args;
  try { args = JSON.parse(fn.arguments); } catch { args = {}; }
  
  const result = { tool_call_id: toolCall.id, role: 'tool' };
  
  switch (name) {
    case 'list_tags': {
      const list = mainData.tags.map(t => ({
        id: t.id, name: t.name, notes: t.notes.map(n => ({ id: n.id, name: n.name }))
      }));
      result.content = JSON.stringify(list);
      break;
    }
    case 'get_note_content': {
      for (const tag of mainData.tags) {
        const note = tag.notes.find(n => n.id === args.noteId);
        if (note) {
          result.content = JSON.stringify({ name: note.name, content: note.content, tagName: tag.name });
          break;
        }
      }
      if (!result.content) result.content = JSON.stringify({ error: '未找到该便签' });
      break;
    }
    case 'search_local_tags': {
      const queries = Array.isArray(args.queries) ? args.queries : [String(args.queries || '')];
      const mode = args.match_mode || 'any';
      const results = queries.map(q => {
        const ql = q.toLowerCase();
        const matched = tagsData.filter(t => {
          const fields = [t.name, t.cn_name, t.wiki].filter(Boolean).map(f => f.toLowerCase());
          if (mode === 'all') return fields.every(f => f.includes(ql));
          return fields.some(f => f.includes(ql));
        }).map(t => ({
          name: t.name, cn_name: t.cn_name || '', wiki: t.wiki || '',
          matched_fields: [t.name, t.cn_name, t.wiki].filter(Boolean).filter(f => f.toLowerCase().includes(ql))
        }));
        return { keyword: q, count: matched.length, matched, suggest_mcp: matched.length === 0 };
      });
      result.content = JSON.stringify({ query_count: queries.length, results });
      break;
    }
    case 'create_note': {
      if (!isAdminUser) { result.content = JSON.stringify({ error: '无权限' }); break; }
      const tag = mainData.tags.find(t => t.id === args.tagId);
      if (!tag) { result.content = JSON.stringify({ error: '未找到该标签' }); break; }
      const newNote = { id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6), name: args.noteName, content: args.noteContent || '' };
      tag.notes.push(newNote);
      result.content = JSON.stringify({ success: true, note: newNote });
      // 标记需要保存
      result._saveMain = true;
      break;
    }
    case 'delete_note': {
      if (!isAdminUser) { result.content = JSON.stringify({ error: '无权限' }); break; }
      let deleted = false;
      for (const tag of mainData.tags) {
        const idx = tag.notes.findIndex(n => n.id === args.noteId);
        if (idx >= 0) { tag.notes.splice(idx, 1); deleted = true; break; }
      }
      result.content = JSON.stringify({ success: deleted });
      if (deleted) result._saveMain = true;
      break;
    }
    case 'create_tag': {
      if (!isAdminUser) { result.content = JSON.stringify({ error: '无权限' }); break; }
      const newTag = { id: 't' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4), name: args.name, cn_name: args.cn_name || '', wiki: args.wiki || '' };
      tagsData.push(newTag);
      result.content = JSON.stringify({ success: true, tag: newTag });
      result._saveTags = true;
      break;
    }
    case 'delete_tag': {
      if (!isAdminUser) { result.content = JSON.stringify({ error: '无权限' }); break; }
      const idx = tagsData.findIndex(t => t.id === args.tagId);
      if (idx >= 0) { tagsData.splice(idx, 1); result.content = JSON.stringify({ success: true }); result._saveTags = true; }
      else { result.content = JSON.stringify({ success: false, error: '未找到该 Tag' }); }
      break;
    }
    default:
      result.content = JSON.stringify({ error: '未知工具: ' + name });
  }
  
  return result;
}

// --- 合并 MCP 工具 ---
async function getMCPTools(mcpConfig) {
  if (!mcpConfig || !mcpConfig.url || mcpConfig.enabled === false) return [];
  let headers = {};
  if (mcpConfig.headers) {
    try {
      const h = typeof mcpConfig.headers === 'string' ? JSON.parse(mcpConfig.headers) : mcpConfig.headers;
      if (h && typeof h === 'object') Object.assign(headers, h);
    } catch {}
  }
  try {
    const resp = await fetch(mcpConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'list', method: 'tools/list', params: {} })
    });
    const data = await resp.json();
    if (data.result && data.result.tools) {
      return data.result.tools.map(t => ({
        type: 'function',
        function: {
          name: 'mcp__' + t.name,
          description: t.description || '',
          parameters: t.inputSchema || { type: 'object', properties: {} }
        }
      }));
    }
  } catch (e) {
    console.error('MCP tools/list 失败:', e);
  }
  return [];
}

// --- 执行 MCP 工具调用 ---
async function executeMCPTool(toolName, args, mcpConfig) {
  const mcpToolName = toolName.replace(/^mcp__/, '');
  let headers = {};
  if (mcpConfig.headers) {
    try {
      const h = typeof mcpConfig.headers === 'string' ? JSON.parse(mcpConfig.headers) : mcpConfig.headers;
      if (h && typeof h === 'object') Object.assign(headers, h);
    } catch {}
  }
  try {
    const resp = await fetch(mcpConfig.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'call_' + Date.now(),
        method: 'tools/call',
        params: { name: mcpToolName, arguments: args }
      })
    });
    const data = await resp.json();
    return { content: JSON.stringify(data.result || data) };
  } catch (e) {
    return { content: JSON.stringify({ error: e.message }) };
  }
}

// --- 处理 AI 聊天 ---
async function handleAiChat(request, env, isAdminUser) {
  let body;
  try { body = await request.json(); } catch { return error('无效的 JSON 请求体'); }
  
  const { messages, model, temperature, stream, systemPrompt, toolsEnabled, mcpConfig, contextLimit } = body;
  
  if (!Array.isArray(messages) || messages.length === 0) return error('messages 无效');
  
  let apiUrl, apiKey;
  
  if (isAdminUser) {
    apiUrl = env.AI_API_URL;
    apiKey = env.AI_API_KEY;
    if (!apiUrl) return error('管理员 AI 地址未配置');
    if (!apiKey) return error('管理员 AI 密钥未配置');
  } else {
    apiUrl = request.headers.get('X-API-URL');
    apiKey = request.headers.get('X-API-Key');
    if (!apiUrl || !apiKey) return error('游客必须提供 X-API-URL 和 X-API-Key 请求头');
  }
  
  const finalModel = model || env.AI_MODEL || 'gpt-4o-mini';
  const finalTemp = temperature !== undefined ? temperature : 0.7;
  const finalStream = stream !== false;
  
  let apiMessages = [...messages];
  if (systemPrompt) {
    apiMessages = [{ role: 'system', content: systemPrompt }, ...apiMessages];
  }
  
  // 上下文轮次限制
  if (contextLimit && contextLimit > 0) {
    const userMsgIndices = [];
    apiMessages.forEach((m, i) => { if (m.role === 'user') userMsgIndices.push(i); });
    if (userMsgIndices.length > contextLimit) {
      const keepFrom = userMsgIndices[userMsgIndices.length - contextLimit];
      const systemMsgs = apiMessages.filter(m => m.role === 'system');
      const restMsgs = apiMessages.slice(keepFrom);
      apiMessages = [...systemMsgs, ...restMsgs];
    }
  }
  
  // 判断是否启用工具
  const hasTools = toolsEnabled === true;
  
  // 加载本地数据用于工具调用
  const mainData = hasTools ? await loadMain(env) : null;
  const tagsData = hasTools ? (await loadTags(env)).items || [] : [];
  
  // 获取 MCP 工具
  let allMCPTools = [];
  if (hasTools && mcpConfig && mcpConfig.enabled === true && mcpConfig.url) {
    allMCPTools = await getMCPTools(mcpConfig);
  }
  
  const tools = hasTools ? [...getToolDefs(isAdminUser), ...allMCPTools] : undefined;
  
  // === 无工具 + 流式：真正的 SSE 透传 ===
  if (!hasTools && finalStream) {
    const upstreamResp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: finalModel,
        messages: apiMessages,
        temperature: finalTemp,
        stream: true
      })
    });
    
    if (!upstreamResp.ok) {
      const errText = await upstreamResp.text();
      return error('AI 请求失败: ' + upstreamResp.status + ' ' + errText, upstreamResp.status);
    }
    
    // 透传 SSE 流
    return new Response(upstreamResp.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
  
  // === 无工具 + 非流式 ===
  if (!hasTools) {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: finalModel,
        messages: apiMessages,
        temperature: finalTemp,
        stream: false
      })
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      return error('AI 请求失败: ' + resp.status + ' ' + errText, resp.status);
    }
    
    const data = await resp.json();
    return json({
      choices: [{
        message: { role: 'assistant', content: data.choices?.[0]?.message?.content || '' },
        index: 0
      }]
    });
  }
  
  // === 有工具：非流式循环（管理工具调用） ===
  const maxToolRounds = 10;
  let toolRound = 0;
  
  while (toolRound < maxToolRounds) {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model: finalModel,
        messages: apiMessages,
        temperature: finalTemp,
        stream: false,
        tools
      })
    });
    
    if (!resp.ok) {
      const errText = await resp.text();
      return error('AI 请求失败: ' + resp.status + ' ' + errText, resp.status);
    }
    
    const data = await resp.json();
    const choice = data.choices && data.choices[0];
    if (!choice) return error('AI 返回格式异常');
    
    const msg = choice.message;
    apiMessages.push(msg);
    
    if (msg.tool_calls && msg.tool_calls.length > 0) {
      let needsSave = false, needsSaveTags = false;
      
      for (const tc of msg.tool_calls) {
        let result;
        const fnName = tc.function.name;
        
        if (fnName.startsWith('mcp__')) {
          result = await executeMCPTool(fnName, JSON.parse(tc.function.arguments || '{}'), mcpConfig);
        } else {
          result = await executeToolCall(tc, mainData, tagsData, isAdminUser);
          if (result._saveMain) needsSave = true;
          if (result._saveTags) needsSaveTags = true;
          delete result._saveMain;
          delete result._saveTags;
        }
        
        apiMessages.push({ role: 'tool', tool_call_id: tc.id, content: result.content });
      }
      
      if (needsSave) {
        await saveMain(env, mainData);
      }
      if (needsSaveTags) {
        await saveTags(env, { items: tagsData });
      }
      
      toolRound++;
      continue;
    }
    
    // 纯文本回复 — 以 SSE 流模拟输出（工具模式已完成非流式循环）
    if (finalStream) {
      const { readable, writable } = new TransformStream();
      const writer = writable.getWriter();
      const encoder = new TextEncoder();
      const content = msg.content || '';
      
      const chunks = content.length > 0
        ? content.split(/(?<=[。！？.!?\n])/).filter(Boolean)
        : [content];
      if (chunks.length === 0) chunks.push(content);
      
      (async () => {
        for (const chunk of chunks) {
          await writer.write(encoder.encode('data: ' + JSON.stringify({
            choices: [{ delta: { content: chunk }, index: 0 }]
          }) + '\n\n'));
        }
        await writer.write(encoder.encode('data: [DONE]\n\n'));
        await writer.close();
      })();
      
      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
    
    return json({
      choices: [{ message: { role: 'assistant', content: msg.content || '' }, index: 0 }]
    });
  }
  
  return error('工具调用循环超过最大次数(' + maxToolRounds + ')');
}

// --- MCP 代理 ---
async function handleMCP(request, action) {
  let body;
  try { body = await request.json(); } catch { return error('无效的 JSON 请求体'); }
  
  const { url, headers: mcpHeaders } = body;
  if (!url) return error('MCP URL 不能为空');
  
  let method = 'tools/list';
  let params = {};
  
  if (action === 'call') {
    method = 'tools/call';
    params = { name: body.toolName, arguments: body.arguments || {} };
    if (!body.toolName) return error('toolName 不能为空');
  } else if (action === 'init') {
    method = 'initialize';
    params = {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'prompt-palette-web', version: '1.0.0' }
    };
  }
  
  // 先发 initialize（如果请求的是 init 或 list/call 需要先 init）
  let headers = { 'Content-Type': 'application/json' };
  if (mcpHeaders) {
    try {
      const h = typeof mcpHeaders === 'string' ? JSON.parse(mcpHeaders) : mcpHeaders;
      Object.assign(headers, h);
    } catch {}
  }
  
  try {
    // 如果是 list 或 call，需要先确保已初始化
    if (action !== 'init') {
      // 发 init 请求
      const initResp = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'init',
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'prompt-palette-web', version: '1.0.0' }
          }
        })
      });
      // 忽略 init 返回，继续请求
    }
    
    const resp = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'req_' + Date.now(),
        method,
        params
      })
    });
    
    const data = await resp.json();
    return json(data);
  } catch (e) {
    return error('MCP 请求失败: ' + e.message);
  }
}

// --- 主路由 ---
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    
    // 判断是否跨域（用于 Cookie 策略）
    const origin = request.headers.get('Origin') || '';
    const isCrossOrigin = origin && (() => {
      try { return new URL(origin).hostname !== url.hostname; } catch { return false; }
    })();
    // 跨域时必须 SameSite=None + Secure，同域用 Lax
    const sameSite = isCrossOrigin ? 'None' : 'Lax';
    const secureAttr = (url.protocol === 'https:' || isCrossOrigin) ? '; Secure' : '';
    
    let response;
    try {
      // ====== API 路由 ======
      
      // 健康检查
      if (path === '/api/health') {
        response = json({ ok: true, time: Date.now() });
      }
      // 登录
      else if (path === '/api/auth/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        if (!username || !password) response = error('用户名和密码不能为空');
        else if (username !== env.ADMIN_USERNAME || password !== env.ADMIN_PASSWORD) {
          response = error('用户名或密码错误', 401);
        } else {
          const secret = env.SESSION_SECRET || env.ADMIN_PASSWORD;
          const token = await signToken({ role: 'admin', username, time: Date.now() }, secret);
          response = new Response(JSON.stringify({ ok: true, username }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Set-Cookie': `pp_admin_token=${token}; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=86400${secureAttr}`
            }
          });
        }
      }
      // 登出
      else if (path === '/api/auth/logout' && request.method === 'POST') {
        response = new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': `pp_admin_token=; HttpOnly; SameSite=${sameSite}; Path=/; Max-Age=0${secureAttr}`
          }
        });
      }
      // 检查登录状态
      else if (path === '/api/auth/me') {
        const admin = await isAdmin(request, env);
        response = admin
          ? json({ ok: true, role: 'admin', username: env.ADMIN_USERNAME || 'admin' })
          : json({ ok: true, role: 'visitor' });
      }
      // 获取主数据（公开）
      else if (path === '/api/data' && request.method === 'GET') {
        response = json(await loadMain(env));
      }
      // 写入主数据（管理员）
      else if (path === '/api/data' && request.method === 'PUT') {
        if (!(await isAdmin(request, env))) response = error('需要管理员权限', 401);
        else {
          const body = await request.json();
          const err = validateMainData(body);
          if (err) response = error(err);
          else {
            const saved = await saveMain(env, body);
            response = json({ ok: true, updatedAt: saved.updatedAt });
          }
        }
      }
      // 获取独立 Tag 数据（公开）
      else if (path === '/api/tags-data' && request.method === 'GET') {
        response = json(await loadTags(env));
      }
      // 写入独立 Tag 数据（管理员）
      else if (path === '/api/tags-data' && request.method === 'PUT') {
        if (!(await isAdmin(request, env))) response = error('需要管理员权限', 401);
        else {
          const body = await request.json();
          let items = body.items || body;
          if (!Array.isArray(items)) {
            if (Array.isArray(body)) items = body;
            else items = null;
          }
          if (!items) response = error('数据格式无效');
          else {
            const err = validateTagsData(items);
            if (err) response = error(err);
            else {
              const saved = await saveTags(env, { items });
              response = json({ ok: true, updatedAt: saved.updatedAt });
            }
          }
        }
      }
      // 导出完整数据（管理员）
      else if (path === '/api/export' && request.method === 'GET') {
        if (!(await isAdmin(request, env))) response = error('需要管理员权限', 401);
        else {
          const main = await loadMain(env);
          const tags = await loadTags(env);
          response = json({ exportTime: new Date().toISOString(), main, tags });
        }
      }
      // 导入数据（管理员）
      else if (path === '/api/import' && request.method === 'POST') {
        if (!(await isAdmin(request, env))) response = error('需要管理员权限', 401);
        else {
          const body = await request.json();
          if (body.main) {
            const err = validateMainData(body.main);
            if (err) response = error('主数据: ' + err);
            else {
              await saveMain(env, body.main);
              response = response || json({ ok: true });
            }
          }
          if (body.tags) {
            const items = body.tags.items || body.tags;
            const err = validateTagsData(items);
            if (err) response = error('Tag数据: ' + err);
            else {
              await saveTags(env, { items });
              response = response || json({ ok: true });
            }
          }
          if (!response) response = json({ ok: true });
        }
      }
      // AI 聊天
      else if (path === '/api/ai/chat' && request.method === 'POST') {
        const admin = await isAdmin(request, env);
        response = await handleAiChat(request, env, admin);
      }
      // MCP 代理
      else if (path === '/api/ai/mcp/init' && request.method === 'POST') {
        response = await handleMCP(request, 'init');
      }
      else if (path === '/api/ai/mcp/list' && request.method === 'POST') {
        response = await handleMCP(request, 'list');
      }
      else if (path === '/api/ai/mcp/call' && request.method === 'POST') {
        response = await handleMCP(request, 'call');
      }
      // 未知 API 路由
      else if (path.startsWith('/api/')) {
        response = error('未知 API 路径: ' + path, 404);
      }
      // ====== 静态资源 ======
      else {
        response = await env.ASSETS.fetch(request);
      }
      
    } catch (e) {
      console.error('Worker Error:', e);
      response = error('服务器内部错误: ' + e.message, 500);
    }
    
    // 统一附加 CORS 头
    return applyCors(request, response);
  }
};