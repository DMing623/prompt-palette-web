// ---------- API 客户端 ----------

// 自动检测：演示站（GitHub Pages）使用本地示例数据，不连接线上 API
const IS_DEMO = location.hostname.includes('github.io') || location.hostname.includes('localhost')

// ---------- 演示站示例数据（不含任何真实数据） ----------
const DEMO_MAIN = {
  tags: [
    {
      id: 'demo-tag-1',
      name: '示例标签',
      notes: [
        { id: 'demo-note-1', name: '示例便签', content: '这是一个无害的示例便签，用于演示界面效果。' }
      ]
    }
  ],
  updatedAt: 0
}

const DEMO_TAGS = {
  items: [
    { id: 'demo-t1', name: '示例TagA', cn_name: '演示用', wiki: '这是一个无害的演示标签' },
    { id: 'demo-t2', name: '示例TagB', cn_name: '演示用', wiki: '这是一个无害的演示标签' },
    { id: 'demo-t3', name: '示例TagC', cn_name: '演示用', wiki: '这是一个无害的演示标签' }
  ],
  updatedAt: 0
}

// ---------- 线上 API 地址（仅非演示站使用） ----------
const WORKER_ORIGIN = 'https://palette.lunisolar.de5.net'
const API_BASE = (() => {
  const host = location.hostname
  if (host.endsWith('lunisolar.de5.net') || host.endsWith('.workers.dev') || host === 'localhost' || host === '127.0.0.1') {
    return ''
  }
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
  me: () => IS_DEMO
    ? Promise.resolve({ ok: true, role: 'visitor' })
    : request('/api/auth/me'),

  login: (username, password) => IS_DEMO
    ? Promise.resolve({ ok: true, username })
    : request('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),

  logout: () => IS_DEMO
    ? Promise.resolve({ ok: true })
    : request('/api/auth/logout', { method: 'POST' }),

  getData: () => IS_DEMO
    ? Promise.resolve(DEMO_MAIN)
    : request('/api/data'),

  putData: (data) => IS_DEMO
    ? Promise.resolve({ tags: data.tags || [], updatedAt: Date.now() })
    : request('/api/data', { method: 'PUT', body: JSON.stringify(data) }),

  getTagsData: () => IS_DEMO
    ? Promise.resolve(DEMO_TAGS)
    : request('/api/tags-data'),

  putTagsData: (items) => IS_DEMO
    ? Promise.resolve({ items, updatedAt: Date.now() })
    : request('/api/tags-data', { method: 'PUT', body: JSON.stringify({ items }) }),

  exportAll: () => IS_DEMO
    ? Promise.resolve({ exportTime: new Date().toISOString(), main: DEMO_MAIN, tags: DEMO_TAGS })
    : request('/api/export'),

  importAll: (payload) => IS_DEMO
    ? Promise.resolve({ ok: true, main: DEMO_MAIN, tags: DEMO_TAGS })
    : request('/api/import', { method: 'POST', body: JSON.stringify(payload) }),

  mcpInit: (url, headers) => request('/api/ai/mcp/init', { method: 'POST', body: JSON.stringify({ url, headers }) }),
  mcpList: (url, headers) => request('/api/ai/mcp/list', { method: 'POST', body: JSON.stringify({ url, headers }) }),
  mcpCall: (url, headers, toolName, args) => request('/api/ai/mcp/call', { method: 'POST', body: JSON.stringify({ url, headers, toolName, arguments: args }) })
}

// 流式 AI 聊天
export async function chatStream({ isAdmin, messages, model, temperature, stream, systemPrompt, toolsEnabled, mcpConfig, contextLimit, onDelta, onDone, onError, visitorUrl, visitorKey }) {
  // 演示站：直接返回模拟回复
  if (IS_DEMO) {
    const reply = '👋 这是演示模式，AI 对话需要连接线上主站才能使用。\n\n请访问 **https://palette.lunisolar.de5.net** 并配置你的 API Key 使用完整功能。'
    onDelta && onDelta(reply)
    onDone && onDone(reply)
    return
  }

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