<template>
  <div class="app-root">
    <!-- 顶部导航 -->
    <header class="app-header">
      <div class="header-left">
        <span class="logo">🎨 PromptPalette</span>
        <span class="header-badge" v-if="store.role === 'admin'">管理员</span>
        <span class="header-badge visitor-badge" v-else>游客</span>
      </div>
      <div class="header-center">
        <div class="header-nav">
          <button :class="{ active: store.activeView === 'notes' }" @click="store.activeView = 'notes'">
            <span class="nav-icon">📋</span> 便签
          </button>
          <button :class="{ active: store.activeView === 'composer' }" @click="store.activeView = 'composer'">
            <span class="nav-icon">🧩</span> 组合
          </button>
          <button :class="{ active: store.activeView === 'ai' }" @click="store.activeView = 'ai'">
            <span class="nav-icon">🤖</span> AI
          </button>
        </div>
      </div>
      <div class="header-right">
        <button v-if="store.role === 'admin'" class="btn btn-ghost btn-sm" @click="onExport">📤 导出</button>
        <button v-if="store.role === 'admin'" class="btn btn-ghost btn-sm" @click="triggerImport">📥 导入</button>
        <input ref="importInput" type="file" accept=".json" style="display:none" @change="onImport" />
        <button v-if="store.role === 'admin'" class="btn btn-ghost btn-sm" @click="showAiSettings = true">⚙️ 设置</button>
        <div v-else class="btn btn-ghost btn-sm" @click="showAiSettings = true">⚙️ AI 设置</div>
        <button v-if="store.role === 'admin'" class="btn btn-ghost btn-sm btn-logout" @click="onLogout">退出</button>
        <button v-else class="btn btn-primary btn-sm" @click="showLogin = true">登录管理</button>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="app-main">
      <NotesView v-if="store.activeView === 'notes'" @open-login="showLogin = true" />
      <ComposerView v-if="store.activeView === 'composer'" />
      <AiView v-if="store.activeView === 'ai'" />
    </main>

    <!-- 模态框 -->
    <LoginModal v-if="showLogin" @close="showLogin = false" @login="onLogin" />
    <ConfirmDialog v-if="store.confirm" />
    <AiSettingsModal v-if="showAiSettings" :is-admin="store.role === 'admin'" @close="showAiSettings = false" />

    <!-- Toast -->
    <div class="toast-container">
      <div v-for="t in store.toasts" :key="t.id" :class="'toast toast-' + t.type">{{ t.message }}</div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { store, loadAllData, checkAuth, toast } from './store'
import { api } from './api'
import NotesView from './components/NotesView.vue'
import ComposerView from './components/ComposerView.vue'
import AiView from './components/AiView.vue'
import LoginModal from './components/LoginModal.vue'
import ConfirmDialog from './components/ConfirmDialog.vue'
import AiSettingsModal from './components/AiSettingsModal.vue'

const showLogin = ref(false)
const showAiSettings = ref(false)
const importInput = ref(null)

async function onLogin() {
  showLogin.value = false
  await loadAllData()
}

async function onLogout() {
  try {
    await api.logout()
    store.role = 'visitor'
    toast('已退出管理', 'info')
    await loadAllData()
  } catch (e) {
    toast('退出失败: ' + e.message, 'error')
  }
}

async function onExport() {
  try {
    const data = await api.exportAll()
    const blob = JSON.stringify(data, null, 2)
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([blob], { type: 'application/json' }))
    a.download = `prompt-palette-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
    toast('导出成功', 'success')
  } catch (e) {
    toast('导出失败: ' + e.message, 'error')
  }
}

function triggerImport() {
  importInput.value?.click()
}

async function onImport(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  try {
    const text = await file.text()
    const data = JSON.parse(text)
    await api.importAll(data)
    toast('导入成功', 'success')
    await loadAllData()
  } catch (e) {
    toast('导入失败: ' + e.message, 'error')
  }
}
</script>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 20px;
  background: rgba(22, 25, 35, 0.8);
  backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 100;
  gap: 12px;
  flex-wrap: wrap;
}
.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.logo {
  font-size: 18px;
  font-weight: 700;
  background: linear-gradient(135deg, var(--primary-light), var(--accent));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.header-badge {
  font-size: 11px;
  padding: 2px 9px;
  border-radius: 20px;
  background: rgba(99, 102, 241, 0.15);
  color: var(--primary-light);
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.visitor-badge {
  background: rgba(34, 211, 238, 0.1);
  color: var(--accent);
  border-color: rgba(34, 211, 238, 0.3);
}
.header-center {
  flex: 1;
  display: flex;
  justify-content: center;
}
.header-nav {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 3px;
}
.header-nav button {
  padding: 6px 18px;
  border-radius: 9px;
  font-size: 13px;
  color: var(--text-dim);
  display: flex;
  align-items: center;
  gap: 5px;
  transition: all 0.2s;
}
.header-nav button.active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.4);
}
.header-nav button:hover:not(.active) {
  color: var(--text);
  background: var(--bg-card);
}
.nav-icon { font-size: 16px; }
.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.btn-logout { color: var(--text-faint); }
.btn-logout:hover { color: var(--danger) !important; border-color: rgba(248, 113, 113, 0.3) !important; }
.app-main {
  flex: 1;
  padding: 16px 20px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}
@media (max-width: 768px) {
  .app-header { flex-direction: column; gap: 8px; padding: 8px 12px; }
  .header-center { width: 100%; }
  .header-nav { width: 100%; }
  .header-nav button { flex: 1; justify-content: center; }
  .header-right { width: 100%; justify-content: center; }
  .app-main { padding: 10px 12px; }
}
</style>