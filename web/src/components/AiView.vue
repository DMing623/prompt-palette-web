<template>
  <div class="ai-view">
    <div class="ai-layout">
      <!-- 对话侧边栏 -->
      <aside class="conv-sidebar" :class="{ open: showSidebar }">
        <div class="sidebar-header">
          <span>对话历史</span>
          <button class="btn btn-sm btn-ghost" @click="newConversation">＋ 新建</button>
        </div>
        <div class="conv-list">
          <div v-for="conv in convStore.conversations" :key="conv.id"
            class="conv-item"
            :class="{ active: conv.id === convStore.currentId }"
            @click="switchConv(conv.id)">
            <span class="conv-title">{{ conv.title || '新对话' }}</span>
            <span class="conv-time">{{ formatTime(conv.updatedAt) }}</span>
            <button class="conv-delete" @click.stop="deleteConv(conv.id)" title="删除">✕</button>
          </div>
          <div v-if="convStore.conversations.length === 0" class="empty-state">
            <div class="empty-icon" style="font-size:28px">💬</div>
            <p>暂无对话</p>
          </div>
        </div>
      </aside>

      <!-- 对话主区域 -->
      <div class="chat-main">
        <div class="chat-header">
          <button class="btn btn-ghost btn-sm sidebar-toggle" @click="showSidebar = !showSidebar">☰</button>
          <span class="chat-title">AI 助手</span>
          <div class="chat-header-actions">
            <button class="btn btn-ghost btn-sm" @click="showSettings = true" title="AI 设置">⚙️</button>
            <button class="btn btn-ghost btn-sm" @click="clearConversation" title="清空对话">↺</button>
          </div>
        </div>

        <div class="chat-messages" ref="messagesRef">
          <div v-if="currentConv.messages.length === 0" class="empty-state">
            <div class="empty-icon" style="font-size:48px">🤖</div>
            <p>开始新的对话吧！</p>
            <p style="font-size:13px;color:var(--text-faint)">在下方输入你的问题或提示词需求</p>
          </div>
          <div v-for="(msg, i) in visibleMessages" :key="i" :class="'msg msg-' + msg.role">
            <div class="msg-avatar">{{ msg.role === 'user' ? '👤' : '🤖' }}</div>
            <div class="msg-content">
              <!-- 工具调用折叠 -->
              <div v-for="(tc, j) in (msg.tool_calls || [])" :key="j" class="tool-call-card">
                <div class="tool-call-header" @click="toggleToolCall(i, j)">
                  <span>{{ expandedTool[i]?.[j] ? '▾' : '▸' }}</span>
                  <span class="tool-call-title">🔧 {{ tc.function.name }}</span>
                </div>
                <div v-if="expandedTool[i]?.[j]" class="tool-call-body">
                  {{ tc.function.arguments }}
                </div>
              </div>
              <!-- 文本渲染 -->
              <div v-if="msg.content" class="md-body" v-html="renderMarkdown(msg.content)"></div>
              <!-- 工具角色消息 -->
              <div v-if="msg.role === 'tool'" class="tool-result">
                {{ msg.content }}
              </div>
            </div>
          </div>
          <!-- 加载更多 -->
          <button v-if="showLoadMore" class="load-more-btn" @click="loadMore">&#8593; 加载更早消息</button>
          <!-- 正在输入 -->
          <div v-if="streaming" class="msg msg-assistant">
            <div class="msg-avatar">🤖</div>
            <div class="msg-content">
              <div class="md-body" v-html="renderMarkdown(streamingContent)"></div>
              <span class="cursor-blink">▊</span>
            </div>
          </div>
        </div>

        <div class="chat-input-bar">
          <textarea
            v-model="inputText"
            :placeholder="placeholder"
            @keydown="onKeyDown"
            rows="2"
            ref="inputRef"
            :disabled="streaming"
          ></textarea>
          <button class="btn btn-primary send-btn" @click="sendMessage" :disabled="!inputText.trim() || streaming">
            {{ streaming ? '…' : '发送' }}
          </button>
        </div>
      </div>
    </div>

    <!-- AI 设置弹窗 -->
    <AiSettingsModal v-if="showSettings" :is-admin="store.role === 'admin'" @close="showSettings = false" />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { store, convStore, saveConversations, toast } from '../store'
import { chatStream } from '../api'
import { markdownToHtml, bindCodeCopy, genId } from '../utils'
import AiSettingsModal from './AiSettingsModal.vue'

const showSidebar = ref(false)
const showSettings = ref(false)
const inputText = ref('')
const inputRef = ref(null)
const messagesRef = ref(null)
const streaming = ref(false)
const streamingContent = ref('')
const expandedTool = ref({})
const visibleCount = ref(20)
const showLoadMore = ref(false)

const currentConv = computed(() => {
  const c = convStore.conversations.find(c => c.id === convStore.currentId)
  if (!c) {
    // 创建默认
    const newConv = { id: genId(), title: '新对话', messages: [], updatedAt: Date.now() }
    convStore.conversations.unshift(newConv)
    convStore.currentId = newConv.id
    return newConv
  }
  return c
})

const visibleMessages = computed(() => {
  const msgs = currentConv.value.messages
  if (msgs.length <= visibleCount.value) {
    showLoadMore.value = false
    return msgs
  }
  showLoadMore.value = true
  return msgs.slice(-visibleCount.value)
})

function loadMore() {
  visibleCount.value += 20
}

function renderMarkdown(content) {
  return markdownToHtml(content || '')
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
}

function toggleToolCall(msgIdx, tcIdx) {
  if (!expandedTool.value[msgIdx]) expandedTool.value[msgIdx] = {}
  expandedTool.value[msgIdx][tcIdx] = !expandedTool.value[msgIdx][tcIdx]
}

const placeholder = computed(() => {
  if (streaming.value) return 'AI 正在回复…'
  return '输入消息，Enter 发送，Shift+Enter 换行'
})

function onKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendMessage()
  }
}

function newConversation() {
  const conv = { id: genId(), title: '新对话', messages: [], updatedAt: Date.now() }
  convStore.conversations.unshift(conv)
  convStore.currentId = conv.id
  visibleCount.value = 20
  saveConversations()
  scrollToBottom()
}

function switchConv(id) {
  if (streaming.value) return
  convStore.currentId = id
  visibleCount.value = 20
  scrollToBottom()
  if (window.innerWidth < 768) showSidebar.value = false
}

function deleteConv(id) {
  if (!confirm('确定删除此对话？')) return
  convStore.conversations = convStore.conversations.filter(c => c.id !== id)
  if (convStore.currentId === id) {
    if (convStore.conversations.length > 0) {
      convStore.currentId = convStore.conversations[0].id
    } else {
      newConversation()
    }
  }
  saveConversations()
}

function clearConversation() {
  if (currentConv.value.messages.length === 0) return
  if (!confirm('确定清空当前对话？')) return
  currentConv.value.messages = []
  currentConv.value.updatedAt = Date.now()
  visibleCount.value = 20
  saveConversations()
}

async function sendMessage() {
  const text = inputText.value.trim()
  if (!text || streaming.value) return

  // 游客必须配置 API URL 和 Key
  if (store.role !== 'admin') {
    if (!store.visitorAi.url.trim() || !store.visitorAi.key.trim()) {
      toast('请先点击 ⚙️ 配置你的 API 地址和密钥', 'warning')
      showSettings.value = true
      return
    }
  }

  inputText.value = ''

  // 添加用户消息
  currentConv.value.messages.push({ role: 'user', content: text })
  currentConv.value.title = currentConv.value.messages.length <= 1
    ? text.slice(0, 30) + (text.length > 30 ? '…' : '')
    : currentConv.value.title
  scrollToBottom()

  // 准备 AI 请求
  streaming.value = true
  streamingContent.value = ''
  const isAdmin = store.role === 'admin'

  const aiConfig = isAdmin ? {} : store.visitorAi

  // 构建消息列表
  let messages = []
  // 系统提示
  const systemPrompt = isAdmin
    ? (localStorage.getItem('pp_admin_system_prompt') || '你是一个有用的提示词助手。')
    : (store.visitorAi.systemPrompt || '你是一个有用的提示词助手。')

  // 消息历史
  messages = currentConv.value.messages.map(m => ({
    role: m.role === 'tool' ? 'tool' : m.role,
    content: m.content || '',
    tool_call_id: m.tool_call_id,
    tool_calls: m.tool_calls ? m.tool_calls.map(tc => ({
      id: tc.id,
      type: 'function',
      function: { name: tc.function.name, arguments: tc.function.arguments }
    })) : undefined
  }))

  // 过滤掉无内容的消息
  messages = messages.filter(m => m.content || m.tool_calls)

  const toolsEnabled = isAdmin
    ? (localStorage.getItem('pp_admin_tools_enabled') !== 'false')
    : (store.visitorAi.toolsEnabled !== false)

  const mcpConfig = {
    enabled: isAdmin
      ? (localStorage.getItem('pp_admin_mcp_enabled') === 'true')
      : (store.visitorAi.mcpEnabled === true),
    url: isAdmin
      ? (localStorage.getItem('pp_admin_mcp_url') || '')
      : (store.visitorAi.mcpUrl || ''),
    headers: isAdmin
      ? (localStorage.getItem('pp_admin_mcp_headers') || '')
      : (store.visitorAi.mcpHeaders || '')
  }

  try {
    await chatStream({
      isAdmin,
      messages,
      model: isAdmin ? (localStorage.getItem('pp_admin_ai_model') || '') : store.visitorAi.model,
      temperature: isAdmin
        ? parseFloat(localStorage.getItem('pp_admin_temperature') || '0.7')
        : store.visitorAi.temperature,
      stream: isAdmin
        ? (localStorage.getItem('pp_admin_stream') !== 'false')
        : store.visitorAi.stream !== false,
      systemPrompt,
      toolsEnabled: toolsEnabled, // 仅本地工具；MCP 由 mcpConfig.enabled 控制
      mcpConfig, // Worker 会根据 mcpConfig.enabled 决定是否获取 MCP 工具
      contextLimit: isAdmin
        ? parseInt(localStorage.getItem('pp_admin_context_limit') || '0')
        : (store.visitorAi.contextLimit || 0),
      onDelta: (delta) => {
        streamingContent.value += delta
        scrollToBottom()
      },
      onDone: (full) => {
        currentConv.value.messages.push({ role: 'assistant', content: full })
        currentConv.value.updatedAt = Date.now()
        streaming.value = false
        streamingContent.value = ''
        saveConversations()
        scrollToBottom()
        // 绑定代码块复制
        nextTick(() => {
          if (messagesRef.value) bindCodeCopy(messagesRef.value)
        })
      },
      visitorUrl: store.visitorAi.url,
      visitorKey: store.visitorAi.key
    })
  } catch (e) {
    streaming.value = false
    streamingContent.value = ''
    toast('AI 请求失败: ' + e.message, 'error')
    // 添加错误消息
    currentConv.value.messages.push({ role: 'assistant', content: '⚠️ 请求出错：' + e.message })
    saveConversations()
  }
}

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

// 绑定代码块复制
watch(streaming, (val) => {
  if (!val) {
    nextTick(() => {
      if (messagesRef.value) bindCodeCopy(messagesRef.value)
    })
  }
})
</script>

<style scoped>
.ai-view {
  max-height: calc(100vh - 130px);
}
.ai-layout {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 16px;
  height: calc(100vh - 140px);
}
.conv-sidebar {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 14px;
}
.conv-list { flex: 1; overflow-y: auto; padding: 8px; }
.conv-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 2px;
  transition: all 0.15s;
}
.conv-item:hover { background: var(--bg-card); }
.conv-item.active {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.25);
}
.conv-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}
.conv-time { font-size: 11px; color: var(--text-faint); flex-shrink: 0; }
.conv-delete {
  width: 20px; height: 20px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--text-faint);
  flex-shrink: 0;
  opacity: 0;
}
.conv-item:hover .conv-delete { opacity: 1; }
.conv-delete:hover { color: var(--danger); background: rgba(248, 113, 113, 0.15); }

.chat-main {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}
.chat-title { font-weight: 600; flex: 1; }
.chat-header-actions { display: flex; gap: 4px; }
.sidebar-toggle { display: none; }

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.msg {
  display: flex;
  gap: 10px;
  max-width: 85%;
}
.msg-user { align-self: flex-end; flex-direction: row-reverse; }
.msg-assistant { align-self: flex-start; }
.msg-avatar {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.msg-content {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 10px 14px;
  font-size: 14px;
  line-height: 1.6;
  min-width: 0;
}
.msg-user .msg-content { background: rgba(99, 102, 241, 0.12); border-color: rgba(99, 102, 241, 0.3); }
.tool-result { color: var(--text-faint); font-size: 12px; font-family: var(--mono); white-space: pre-wrap; }

.cursor-blink { animation: blink 0.8s infinite; color: var(--primary-light); font-size: 16px; }

.load-more-btn {
  display: block;
  width: 100%;
  padding: 8px;
  text-align: center;
  color: var(--text-dim);
  font-size: 13px;
  border-radius: 8px;
  background: var(--bg-card);
  border: 1px solid var(--border);
}
.load-more-btn:hover { color: var(--text); }

.chat-input-bar {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  background: var(--bg);
}
.chat-input-bar textarea {
  flex: 1;
  padding: 10px 14px;
  border-radius: 12px;
  font-size: 14px;
  line-height: 1.5;
  min-height: 44px;
  max-height: 120px;
  resize: none;
}
.send-btn {
  padding: 10px 20px;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 768px) {
  .ai-layout { grid-template-columns: 1fr; }
  .conv-sidebar {
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 280px;
    z-index: 500;
    border-radius: 0;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
  }
  .conv-sidebar.open { transform: translateX(0); }
  .sidebar-toggle { display: inline-flex !important; }
  .msg { max-width: 95%; }
}
</style>
