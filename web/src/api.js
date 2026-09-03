// ---------- API 客户端 ----------

// 自动检测 API 基础地址
// 在 Worker 部署域上（同域）→ API 相对路径；在 GitHub Pages 等外部站点 → 指向线上 Worker
const WORKER_ORIGIN = 'https://palette.lunisolar.de5.net'
const API_BASE = (() => {
  const host = location.hostname
  // 同域部署（Worker 或 localhost dev）
  if (host.endsWith('lunisolar.de5.net') || host.endsWith('.workers.dev') || host === 'localhost' || host === '127.0.0.1') {
    return ''
  }
  // 演示站（GitHub Pages 等）→ 指向线上 Worker
  return WORKER_ORIGIN
})()

async function request(path, options = {}) {
  const url = API_BASE + path
  const resp = await fetch(url, {
    credentials: API_BASE ? 'include' : 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  })
  if (!resp.ok) {
    let msg = '请求失败 (' + resp.status + ')'
    try {
      const data = await resp.json()
      if (data.error) msg = data.error
    } catch {}
    throw new Error(msg)
  }
  const ct = resp.headers.get('Content-Type') || ''
  if (ct.includes('text/event-stream')) return resp
  if (resp.status === 204) return null
  return resp.json()
}

export const api = {
  // 认证
  me: () => request('/api/auth/me'),
  login: (username, password) => request('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ username, password })
  }),
  logout: () => request('/api/auth/logout', { method: 'POST' }),

  // 数据
  getData: () => request('/api/data'),
  putData: (data) => request('/api/data', {
    method: 'PUT', body: JSON.stringify(data)
  }),
  getTagsData: () => request('/api/tags-data'),
  putTagsData: (items) => request('/api/tags-data', {
    method: 'PUT', body: JSON.stringify({ items })
  }),

  // 导入导出（管理员）
  exportAll: () => request('/api/export'),
  importAll: (payload) => request('/api/import', {
    method: 'POST', body: JSON.stringify(payload)
  }),

  // MCP 代理
  mcpInit: (url, headers) => request('/api/ai/mcp/init', {
    method: 'POST', body: JSON.stringify({ url, headers })
  }),
  mcpList: (url, headers) => request('/api/ai/mcp/list', {
    method: 'POST', body: JSON.stringify({ url, headers })
  }),
  mcpCall: (url, headers, toolName, args) => request('/api/ai/mcp/call', {
    method: 'POST', body: JSON.stringify({ url, headers, toolName, arguments: args })
  })
}

// 流式 AI 聊天
export async function chatStream({ isAdmin, messages, model, temperature, stream, systemPrompt, toolsEnabled, mcpConfig, contextLimit, onDelta, onDone, onError, visitorUrl, visitorKey }) {
  const headers = { 'Content-Type': 'application/json' }
  if (!isAdmin) {
    headers['X-API-URL'] = visitorUrl || ''
    headers['X-API-Key'] = visitorKey || ''
  }

  const url = API_BASE + '/api/ai/chat'
  const resp = await fetch(url, {
    method: 'POST',
    credentials: API_BASE ? 'include' : 'same-origin',
    headers,
    body: JSON.stringify({
      messages, model, temperature, stream: stream !== false,
      systemPrompt, toolsEnabled, mcpConfig, contextLimit
    })
  })

  if (!resp.ok) {
    let msg = 'AI 请求失败 (' + resp.status + ')'
    try {
      const data = await resp.json()
      if (data.error) msg = data.error
    } catch {}
    throw new Error(msg)
  }

  const ct = resp.headers.get('Content-Type') || ''
  if (!ct.includes('text/event-stream')) {
    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content || ''
    onDelta && onDelta(content)
    onDone && onDone(content)
    return
  }

  // 流式解析 SSE
  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const evt = JSON.parse(payload)
        const delta = evt.choices?.[0]?.delta?.content
        if (delta) {
          full += delta
          onDelta && onDelta(delta)
        }
      } catch {}
    }
  }
  onDone && onDone(full)
}
