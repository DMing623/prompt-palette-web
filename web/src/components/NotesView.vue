<template>
  <div class="notes-view">
    <div v-if="store.loadingData" class="loading-center">
      <div class="spinner"></div>
      <span>加载数据中…</span>
    </div>

    <div v-else-if="store.dataError" class="empty-state">
      <div class="empty-icon">⚠️</div>
      <p>数据加载失败：{{ store.dataError }}</p>
    </div>

    <template v-else>
      <!-- 标签侧栏 + 便签区 -->
      <div class="notes-layout">
        <!-- 标签侧栏 -->
        <aside class="tag-sidebar panel">
          <div class="sidebar-header">
            <span>标签分类</span>
            <span class="tag-count">{{ store.main.tags.length }}</span>
          </div>
          <div class="tag-list">
            <button
              v-for="tag in store.main.tags"
              :key="tag.id"
              class="tag-item"
              :class="{ active: tag.id === store.activeTagId }"
              @click="store.activeTagId = tag.id"
            >
              <span class="tag-dot"></span>
              <span class="tag-name">{{ tag.name }}</span>
              <span class="tag-note-count">{{ tag.notes.length }}</span>
            </button>

            <button v-if="isAdmin" class="tag-add" @click="promptAddTag">
              <span>＋ 新建标签</span>
            </button>
          </div>
          <div v-if="!isAdmin" class="sidebar-tip">
            <div class="visitor-tip">
              <span>👀 游客只读模式</span>
              <p>登录管理员后可增删改便签</p>
              <button class="btn btn-primary btn-sm" @click="$emit('open-login')">登录管理</button>
            </div>
          </div>
        </aside>

        <!-- 便签区 -->
        <section class="notes-main panel">
          <div class="notes-toolbar">
            <div class="toolbar-left">
              <div class="toolbar-title">
                <template v-if="activeTag">{{ activeTag.name }}</template>
                <template v-else>全部便签</template>
              </div>
              <span v-if="activeTag" class="note-total">{{ activeTag.notes.length }} 条</span>
            </div>
            <div class="toolbar-right">
              <div class="search-box">
                <span class="search-icon">🔍</span>
                <input v-model="store.search" placeholder="搜索便签名称或内容…" />
                <button v-if="store.search" class="search-clear" @click="store.search = ''">✕</button>
              </div>
              <template v-if="isAdmin">
                <button class="btn btn-ghost btn-sm" @click="onExport">📤 导出</button>
                <button class="btn btn-ghost btn-sm" @click="triggerImport">📥 导入</button>
                <input ref="importInput" type="file" accept=".json" style="display:none" @change="onImport" />
                <button class="btn btn-primary btn-sm" @click="promptAddNote">＋ 新建便签</button>
              </template>
            </div>
          </div>

          <div class="note-grid">
            <NoteCard
              v-for="note in filteredNotes"
              :key="note.id"
              :note="note"
              :is-admin="isAdmin"
              :tag-id="store.activeTagId"
              @refresh="refresh"
            />

            <button v-if="isAdmin" class="note-add-card" @click="promptAddNote">
              <span class="add-icon">＋</span>
              <span>添加便签</span>
            </button>
          </div>

          <div v-if="!filteredNotes.length && !(isAdmin && activeTag)" class="empty-state">
            <div class="empty-icon">🗒️</div>
            <p>选择左侧标签查看便签</p>
          </div>
          <div v-if="activeTag && filteredNotes.length === 0 && store.search" class="empty-state">
            <div class="empty-icon">🔍</div>
            <p>未找到匹配“{{ store.search }}”的便签</p>
          </div>
        </section>
      </div>
    </template>

    <!-- 便签编辑弹窗 -->
    <div v-if="noteModal" class="modal-overlay" @click.self="noteModal = null">
      <div class="modal" style="width: 560px">
        <div class="modal-header">
          <span>{{ noteModal.isNew ? '新建便签' : '编辑便签' }}</span>
          <button class="modal-close" @click="noteModal = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>便签名称</label>
            <input v-model="noteModal.name" placeholder="例如：写作助手" maxlength="100" />
          </div>
          <div class="field">
            <label>提示词内容</label>
            <textarea v-model="noteModal.content" rows="10" placeholder="输入提示词内容…"></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="noteModal = null">取消</button>
          <button class="btn btn-primary" @click="saveNote" :disabled="!noteModal.name.trim()">保存</button>
        </div>
      </div>
    </div>

    <!-- 标签编辑弹窗 -->
    <div v-if="tagModal" class="modal-overlay" @click.self="tagModal = null">
      <div class="modal" style="width: 380px">
        <div class="modal-header">
          <span>{{ tagModal.isNew ? '新建标签' : '重命名标签' }}</span>
          <button class="modal-close" @click="tagModal = null">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>标签名称</label>
            <input v-model="tagModal.name" placeholder="例如：人物、场景、风格…" maxlength="50" @keyup.enter="saveTag" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="tagModal = null">取消</button>
          <button class="btn btn-primary" @click="saveTag" :disabled="!tagModal.name.trim()">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { store, toast, askConfirm } from '../store'
import { api } from '../api'
import { genId, decodeFileText } from '../utils'
import NoteCard from './NoteCard.vue'

// 事件总线：NoteCard 通过 window 事件触发编辑
const EDIT_NOTE_EVENT = 'pp-edit-note'
const EDIT_TAG_EVENT = 'pp-edit-tag'

defineEmits(['open-login'])

const isAdmin = computed(() => store.role === 'admin')
const activeTag = computed(() => store.main.tags.find(t => t.id === store.activeTagId) || null)
const filteredNotes = computed(() => {
  const q = store.search.trim().toLowerCase()
  if (!activeTag.value) return []
  const notes = activeTag.value.notes || []
  if (!q) return notes
  return notes.filter(n =>
    n.name.toLowerCase().includes(q) || (n.content || '').toLowerCase().includes(q)
  )
})

const noteModal = ref(null)
const tagModal = ref(null)
const importInput = ref(null)

// ---- 导出 / 导入（管理员专属，作用于标签便签数据） ----
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
  store.importing = true
  try {
    // 自动检测文件编码（UTF-8 / GB18030），避免中文乱码
    const text = await decodeFileText(file)
    const data = JSON.parse(text)
    // 后端返回保存后的完整数据（规避 KV 最终一致性导致的读延迟）
    const resp = await api.importAll(data)
    if (resp.main && resp.main.tags) {
      store.main = resp.main
      if (!store.activeTagId || !store.main.tags.find(t => t.id === store.activeTagId)) {
        store.activeTagId = store.main.tags[0]?.id || ''
      }
    }
    if (resp.tags && resp.tags.items) {
      store.tagsData = resp.tags.items
    }
    toast('导入成功', 'success')
    // 后台静默同步一次（无需阻塞 UI；若 KV 未传播会短暂读取旧值，可自动恢复）
    setTimeout(() => { refresh().catch(() => {}) }, 1500)
  } catch (err) {
    toast('导入失败: ' + err.message, 'error')
  } finally {
    store.importing = false
  }
}

// 监听编辑事件
function onEditNote(e) {
  if (!isAdmin.value) return
  const note = e.detail
  if (note) promptEditNote(note)
}
function onEditTag() {
  if (!isAdmin.value) return
  promptRenameTag()
}
onMounted(() => {
  window.addEventListener(EDIT_NOTE_EVENT, onEditNote)
  window.addEventListener(EDIT_TAG_EVENT, onEditTag)
})
onUnmounted(() => {
  window.removeEventListener(EDIT_NOTE_EVENT, onEditNote)
  window.removeEventListener(EDIT_TAG_EVENT, onEditTag)
})

async function refresh() {
  try {
    const main = await api.getData()
    store.main = main
    if (store.activeTagId && !main.tags.find(t => t.id === store.activeTagId)) {
      store.activeTagId = main.tags[0]?.id || ''
    }
  } catch (e) {
    toast('刷新失败: ' + e.message, 'error')
  }
}

// ---- 标签 ----
function promptAddTag() {
  tagModal.value = { isNew: true, name: '' }
}
function promptRenameTag() {
  if (!activeTag.value) return
  tagModal.value = { isNew: false, id: activeTag.value.id, name: activeTag.value.name }
}
async function saveTag() {
  if (!tagModal.value?.name.trim()) return
  const name = tagModal.value.name.trim()
  const tags = JSON.parse(JSON.stringify(store.main.tags))
  if (tagModal.value.isNew) {
    const tag = { id: genId(), name, notes: [] }
    tags.push(tag)
    store.main.tags = tags
    store.activeTagId = tag.id
  } else {
    const idx = tags.findIndex(t => t.id === tagModal.value.id)
    if (idx >= 0) tags[idx].name = name
    store.main.tags = tags
  }
  tagModal.value = null
  await saveMain()
  toast(tagModal.value?.isNew ? '标签已创建' : '标签已重命名', 'success')
}

// ---- 便签 ----
function promptAddNote() {
  noteModal.value = { isNew: true, name: '', content: '' }
}
function promptEditNote(note) {
  noteModal.value = { isNew: false, id: note.id, name: note.name, content: note.content }
}
async function saveNote() {
  const m = noteModal.value
  if (!m?.name.trim()) return
  const tags = JSON.parse(JSON.stringify(store.main.tags))
  const tag = tags.find(t => t.id === store.activeTagId)
  if (!tag) return
  if (m.isNew) {
    tag.notes.push({ id: genId(), name: m.name.trim(), content: m.content || '' })
  } else {
    const note = tag.notes.find(n => n.id === m.id)
    if (note) {
      note.name = m.name.trim()
      note.content = m.content || ''
    }
  }
  store.main.tags = tags
  noteModal.value = null
  await saveMain()
  toast(m.isNew ? '便签已创建' : '便签已保存', 'success')
}

async function saveMain() {
  try {
    await api.putData({ tags: store.main.tags })
  } catch (e) {
    toast('保存失败: ' + e.message, 'error')
  }
}

// 供 NoteCard 调用
defineExpose({ promptEditNote, promptRenameTag })
</script>

<style scoped>
.notes-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
}
.panel {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.tag-sidebar {
  display: flex;
  flex-direction: column;
  max-height: calc(100vh - 130px);
}
.sidebar-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
  font-size: 14px;
}
.tag-count {
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-dim);
  font-size: 12px;
  padding: 1px 9px;
  border-radius: 20px;
}
.tag-list {
  padding: 8px;
  overflow-y: auto;
  flex: 1;
}
.tag-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  margin-bottom: 2px;
  text-align: left;
  transition: all 0.15s;
  color: var(--text-dim);
}
.tag-item:hover { background: var(--bg-card); color: var(--text); }
.tag-item.active {
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.08));
  color: var(--primary-light);
  border: 1px solid rgba(99, 102, 241, 0.25);
}
.tag-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-light);
  flex-shrink: 0;
  transition: all 0.2s;
}
.tag-item.active .tag-dot { background: var(--primary-light); box-shadow: 0 0 8px var(--primary); }
.tag-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}
.tag-note-count {
  font-size: 11px;
  color: var(--text-faint);
  background: var(--bg-input);
  padding: 1px 8px;
  border-radius: 10px;
}
.tag-add {
  width: 100%;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px dashed var(--border-light);
  color: var(--text-dim);
  font-size: 13px;
  transition: all 0.2s;
}
.tag-add:hover {
  border-color: var(--primary);
  color: var(--primary-light);
  background: rgba(99, 102, 241, 0.08);
}
.sidebar-tip {
  padding: 12px;
  border-top: 1px solid var(--border);
}
.visitor-tip {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 10px;
  text-align: center;
}
.visitor-tip span { font-size: 13px; color: var(--text-dim); }
.visitor-tip p { font-size: 12px; color: var(--text-faint); margin: 4px 0 8px; }

.notes-main {
  padding: 16px;
  max-height: calc(100vh - 130px);
  overflow-y: auto;
}
.notes-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}
.toolbar-left { display: flex; align-items: center; gap: 10px; }
.toolbar-title { font-size: 18px; font-weight: 700; }
.note-total { font-size: 12px; color: var(--text-faint); }
.toolbar-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.search-box {
  position: relative;
  width: 240px;
}
.search-box input { padding-left: 34px; padding-right: 30px; }
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 13px;
  opacity: 0.7;
}
.search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--bg-card);
  color: var(--text-faint);
  font-size: 11px;
}
.search-clear:hover { color: var(--text); }

.note-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}
.note-add-card {
  min-height: 120px;
  border: 1.5px dashed var(--border-light);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-faint);
  transition: all 0.2s;
}
.note-add-card:hover {
  border-color: var(--primary);
  color: var(--primary-light);
  background: rgba(99, 102, 241, 0.05);
}
.add-icon { font-size: 24px; }
.modal-close {
  font-size: 14px;
  color: var(--text-faint);
  width: 28px;
  height: 28px;
  border-radius: 8px;
}
.modal-close:hover { background: var(--bg-card); color: var(--text); }
@media (max-width: 768px) {
  .notes-layout { grid-template-columns: 1fr; }
  .tag-sidebar { max-height: 200px; }
  .search-box { width: 100%; }
}
</style>