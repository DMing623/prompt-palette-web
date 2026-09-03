import { reactive } from 'vue'
import { api } from './api'

// ---------- 全局状态 ----------
export const store = reactive({
  // 认证
  role: 'visitor',       // 'admin' | 'visitor'
  checkingAuth: true,

  // 数据
  main: { tags: [], updatedAt: 0 },   // 主数据（标签/便签）
  tagsData: [],                        // 独立 Tag 数据
  loadingData: true,
  dataError: '',

  // UI 状态
  activeView: 'notes',   // 'notes' | 'composer' | 'ai'
  activeTagId: '',
  search: '',
  keyboardDisabled: false,

  // 游客 AI 配置（localStorage）
  visitorAi: {
    url: '',
    key: '',
    model: '',
    temperature: 0.7,
    stream: true,
    systemPrompt: '',
    toolsEnabled: true,
    mcpEnabled: false,
    mcpUrl: '',
    mcpHeaders: '',
    contextLimit: 0
  },

  // Toast 队列
  toasts: [],

  // 确认框
  confirm: null,   // { title, message, danger, onConfirm }
})

// ---------- 本地持久化（游客 AI 配置） ----------
const VISITOR_AI_KEY = 'pp_visitor_ai_config'

export function loadVisitorAi() {
  try {
    const raw = localStorage.getItem(VISITOR_AI_KEY)
    if (raw) Object.assign(store.visitorAi, JSON.parse(raw))
  } catch {}
}
export function saveVisitorAi() {
  try {
    localStorage.setItem(VISITOR_AI_KEY, JSON.stringify(store.visitorAi))
  } catch {}
}

// ---------- 对话历史持久化 ----------
const CONV_KEY = 'pp_conversations'
export const convStore = reactive({
  conversations: [],   // [{ id, title, updatedAt, messages }]
  currentId: ''
})

export function loadConversations() {
  try {
    const raw = localStorage.getItem(CONV_KEY)
    if (raw) {
      convStore.conversations = JSON.parse(raw)
      if (convStore.conversations.length > 0) convStore.currentId = convStore.conversations[0].id
    }
  } catch {}
}
export function saveConversations() {
  try {
    localStorage.setItem(CONV_KEY, JSON.stringify(convStore.conversations))
  } catch {}
}

// ---------- Toast ----------
let toastId = 0
export function toast(message, type = 'info', duration = 2500) {
  const id = ++toastId
  store.toasts.push({ id, message, type })
  setTimeout(() => {
    const idx = store.toasts.findIndex(t => t.id === id)
    if (idx >= 0) store.toasts.splice(idx, 1)
  }, duration)
}

// ---------- 确认框 ----------
export function askConfirm(title, message, onConfirm, danger = true) {
  store.confirm = { title, message, danger, onConfirm }
}

// ---------- 数据加载 ----------
export async function loadAllData(retryCount = 0) {
  store.loadingData = true
  store.dataError = ''
  try {
    const [main, tags] = await Promise.all([api.getData(), api.getTagsData()])
    // KV 最终一致性：刚写入后读取可能拿到旧值（空数据），延迟重试
    const hasMainData = Array.isArray(main.tags) && main.tags.length > 0
    const hasTagsData = Array.isArray(tags.items ? tags.items : tags) && (tags.items ? tags.items.length > 0 : tags.length > 0)
    if (!hasMainData && !hasTagsData && retryCount < 3) {
      // 可能读到 KV 旧值（空），稍后重试
      setTimeout(() => loadAllData(retryCount + 1), 1200 * (retryCount + 1))
    }
    store.main = main
    store.tagsData = Array.isArray(tags) ? tags : (tags.items || [])
    if (store.activeTagId && !store.main.tags.find(t => t.id === store.activeTagId)) {
      store.activeTagId = ''
    }
    if (!store.activeTagId && store.main.tags.length > 0) {
      store.activeTagId = store.main.tags[0].id
    }
  } catch (e) {
    store.dataError = e.message
  } finally {
    store.loadingData = false
  }
}

// ---------- 认证检查 ----------
export async function checkAuth() {
  store.checkingAuth = true
  try {
    const me = await api.me()
    store.role = me.role || 'visitor'
  } catch {
    store.role = 'visitor'
  } finally {
    store.checkingAuth = false
  }
}

// ---------- 派生状态 ----------
export const getters = {
  activeTag: () => store.main.tags.find(t => t.id === store.activeTagId) || null,
  filteredNotes: () => {
    const tag = store.main.tags.find(t => t.id === store.activeTagId) || null
    if (!tag) return []
    const q = store.search.trim().toLowerCase()
    if (!q) return tag.notes
    return tag.notes.filter(n =>
      n.name.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    )
  }
}

// 初始化
loadVisitorAi()
loadConversations()
checkAuth()
loadAllData()