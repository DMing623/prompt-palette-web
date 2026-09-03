<template>
  <div class="composer-panel">
    <div class="composer-tabs">
      <button :class="{ active: activeTab === 'notes' }" @click="activeTab = 'notes'">📋 便签组合</button>
      <button :class="{ active: activeTab === 'tags' }" @click="activeTab = 'tags'">🏷️ Tag 组合</button>
    </div>

    <!-- 便签组合 -->
    <div v-show="activeTab === 'notes'" class="composer-tab-body">
      <div class="composer-layout">
        <aside class="comp-tag-bar">
          <button
            v-for="tag in store.main.tags"
            :key="tag.id"
            :class="{ active: compTagId === tag.id }"
            @click="compTagId = tag.id"
          >{{ tag.name }}</button>
        </aside>
        <div class="comp-note-list">
          <div v-if="!compTagId" class="empty-state"><div class="empty-icon">👈</div><p>选择左侧标签选择便签</p></div>
          <template v-else>
            <div v-for="note in currentNotes" :key="note.id"
              class="comp-note-item"
              :class="{ selected: selectedNotes.has(note.id) }"
              @click="toggleNote(note.id)">
              <span class="note-order" v-if="orderedNotes.indexOf(note.id) >= 0">{{ orderedNotes.indexOf(note.id) + 1 }}</span>
              <div class="comp-note-info">
                <div class="comp-note-name">{{ note.name }}</div>
                <div class="comp-note-preview">{{ note.content }}</div>
              </div>
            </div>
            <div v-if="currentNotes.length === 0" class="empty-state"><p>该标签下暂无便签</p></div>
          </template>
        </div>
      </div>
    </div>

    <!-- Tag 组合 -->
    <div v-show="activeTab === 'tags'" class="composer-tab-body">
      <div class="tags-toolbar">
        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input v-model="tagSearch" placeholder="搜索 Tag…" />
          <button v-if="tagSearch" class="search-clear" @click="tagSearch = ''">✕</button>
        </div>
        <div class="tags-toolbar-btns">
          <button v-if="isAdmin" class="btn btn-sm btn-ghost" @click="addTag">＋ 新增</button>
          <button class="btn btn-sm btn-ghost" @click="triggerImportCSV">📥 导入 CSV</button>
          <button class="btn btn-sm btn-ghost" @click="exportCSV">📤 导出 CSV</button>
          <input ref="csvInput" type="file" accept=".csv" style="display:none" @change="importCSV" />
        </div>
      </div>
      <div class="tag-list">
        <div v-for="tag in filteredTags" :key="tag.id"
          class="comp-tag-item"
          :class="{ selected: selectedTags.has(tag.id) }"
          @click="toggleTag(tag.id)">
          <div class="tag-order" v-if="orderedTags.indexOf(tag.id) >= 0">{{ orderedTags.indexOf(tag.id) + 1 }}</div>
          <div class="tag-info">
            <div class="tag-name">{{ tag.name }}</div>
            <div class="tag-cn-name" v-if="tag.cn_name">{{ tag.cn_name }}</div>
            <div class="tag-detail" v-if="showWiki[tag.id]">{{ tag.wiki || '（无说明）' }}</div>
          </div>
          <div class="tag-actions" v-if="isAdmin">
            <button class="tag-action" @click.stop="editTag(tag)" title="编辑">✏️</button>
            <button class="tag-action" @click.stop="deleteTag(tag)" title="删除">🗑️</button>
            <button class="tag-action" @click.stop="toggleWiki(tag.id)" title="展开说明">
              {{ showWiki[tag.id] ? '▾' : '▸' }}
            </button>
          </div>
        </div>
        <div v-if="filteredTags.length === 0" class="empty-state">
          <div class="empty-icon">🏷️</div>
          <p>{{ tagSearch ? '未找到匹配的 Tag' : '暂无独立 Tag，请导入 CSV 或新增' }}</p>
        </div>
      </div>
    </div>

    <!-- 组合结果 -->
    <div class="composer-result">
      <textarea v-model="composedText" rows="8" placeholder="组合后的文本将显示在这里…"></textarea>
      <div class="composer-actions">
        <button class="btn btn-primary btn-sm" @click="copyComposed">📋 一键复制</button>
        <button class="btn btn-ghost btn-sm" @click="clearComposed">🗑 一键清空</button>
        <span class="composer-stat" v-if="orderedItems.length > 0">已选 {{ orderedItems.length }} 项</span>
      </div>
    </div>

    <!-- Tag 编辑模态 -->
    <div v-if="editTagModal" class="modal-overlay" @click.self="editTagModal = null">
      <div class="modal" style="width: 480px">
        <div class="modal-header"><span>{{ editTagModal.isNew ? '新增 Tag' : '编辑 Tag' }}</span><button class="modal-close" @click="editTagModal = null">✕</button></div>
        <div class="modal-body">
          <div class="field"><label>Tag 名称 (name)</label><input v-model="editTagModal.name" placeholder="如 1girl" /></div>
          <div class="field"><label>中文名/别名 (cn_name)</label><input v-model="editTagModal.cn_name" placeholder="如 1个女孩,单人" /></div>
          <div class="field"><label>Wiki 说明</label><textarea v-model="editTagModal.wiki" rows="4" placeholder="画面中只出现一个女性角色…"></textarea></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" @click="editTagModal = null">取消</button>
          <button class="btn btn-primary" @click="saveTagEdit" :disabled="!editTagModal.name.trim()">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { store, toast } from '../store'
import { api } from '../api'
import { genId, toCSV, parseCSV, downloadFile } from '../utils'

const isAdmin = computed(() => store.role === 'admin')
const activeTab = ref('notes')
const compTagId = ref(store.main.tags[0]?.id || '')
const tagSearch = ref('')
const csvInput = ref(null)
const showWiki = ref({})
const editTagModal = ref(null)

// 便签组合状态
const selectedNotes = ref(new Set())
const orderedNotes = ref([])

// Tag 组合状态
const selectedTags = ref(new Set())
const orderedTags = ref([])

const composedText = ref('')

const currentNotes = computed(() => {
  const tag = store.main.tags.find(t => t.id === compTagId.value)
  return tag?.notes || []
})

const filteredTags = computed(() => {
  const q = tagSearch.value.trim().toLowerCase()
  if (!q) return store.tagsData
  return store.tagsData.filter(t =>
    t.name.toLowerCase().includes(q) ||
    (t.cn_name || '').toLowerCase().includes(q) ||
    (t.wiki || '').toLowerCase().includes(q)
  )
})

const orderedItems = computed(() => {
  if (activeTab.value === 'notes') return orderedNotes.value
  return orderedTags.value
})

// 便签组合
function toggleNote(id) {
  const s = selectedNotes.value
  if (s.has(id)) {
    s.delete(id)
    orderedNotes.value = orderedNotes.value.filter(x => x !== id)
  } else {
    s.add(id)
    orderedNotes.value.push(id)
  }
  updateComposed()
}

// Tag 组合
function toggleTag(id) {
  const s = selectedTags.value
  if (s.has(id)) {
    s.delete(id)
    orderedTags.value = orderedTags.value.filter(x => x !== id)
  } else {
    s.add(id)
    orderedTags.value.push(id)
  }
  updateComposed()
}

function toggleWiki(id) {
  showWiki.value[id] = !showWiki.value[id]
}

function updateComposed() {
  if (activeTab.value === 'notes') {
    const contents = []
    for (const id of orderedNotes.value) {
      for (const tag of store.main.tags) {
        const note = tag.notes.find(n => n.id === id)
        if (note) { contents.push(note.content); break }
      }
    }
    composedText.value = contents.join('\n\n')
  } else {
    const names = []
    for (const id of orderedTags.value) {
      const tag = store.tagsData.find(t => t.id === id)
      if (tag) names.push(tag.name)
    }
    composedText.value = names.join(', ')
  }
}

// 监听页签切换 => 更新组合文本
function syncComposed() {
  selectedNotes.value.clear()
  orderedNotes.value = []
  selectedTags.value.clear()
  orderedTags.value = []
  composedText.value = ''
}

// 新增 Tag
function addTag() {
  editTagModal.value = { isNew: true, id: '', name: '', cn_name: '', wiki: '' }
}

function editTag(tag) {
  editTagModal.value = { isNew: false, id: tag.id, name: tag.name, cn_name: tag.cn_name || '', wiki: tag.wiki || '' }
}

async function saveTagEdit() {
  const m = editTagModal.value
  if (!m?.name.trim()) return
  const tags = [...store.tagsData]
  if (m.isNew) {
    tags.push({ id: genId(), name: m.name.trim(), cn_name: m.cn_name || '', wiki: m.wiki || '' })
  } else {
    const idx = tags.findIndex(t => t.id === m.id)
    if (idx >= 0) tags[idx] = { ...tags[idx], name: m.name.trim(), cn_name: m.cn_name || '', wiki: m.wiki || '' }
  }
  store.tagsData = tags
  editTagModal.value = null
  try {
    await api.putTagsData(tags)
    toast(m.isNew ? 'Tag 已创建' : 'Tag 已更新', 'success')
  } catch (e) {
    toast('保存失败: ' + e.message, 'error')
  }
}

async function deleteTag(tag) {
  if (!confirm(`确定删除 Tag「${tag.name}」？`)) return
  const tags = store.tagsData.filter(t => t.id !== tag.id)
  store.tagsData = tags
  selectedTags.value.delete(tag.id)
  orderedTags.value = orderedTags.value.filter(x => x !== tag.id)
  updateComposed()
  try {
    await api.putTagsData(tags)
    toast('Tag 已删除', 'success')
  } catch (e) {
    toast('删除失败: ' + e.message, 'error')
  }
}

// CSV 导入导出
function exportCSV() {
  const headers = ['name', 'cn_name', 'wiki']
  const rows = store.tagsData.map(t => [t.name, t.cn_name || '', t.wiki || ''])
  const csv = toCSV(headers, rows)
  downloadFile(`tags-export-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv')
  toast('CSV 导出成功', 'success')
}

function triggerImportCSV() {
  csvInput.value?.click()
}

async function importCSV(e) {
  const file = e.target.files?.[0]
  if (!file) return
  e.target.value = ''
  try {
    const text = await file.text()
    const rows = parseCSV(text)
    if (rows.length < 2) { toast('CSV 格式无效', 'error'); return }
    const headers = rows[0].map(h => h.trim().toLowerCase())
    const nameIdx = headers.indexOf('name')
    const cnIdx = headers.indexOf('cn_name')
    const wikiIdx = headers.indexOf('wiki')
    if (nameIdx < 0) { toast('CSV 缺少 name 列', 'error'); return }
    const existing = new Map(store.tagsData.map(t => [t.name, t]))
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i]
      const name = (r[nameIdx] || '').trim()
      if (!name) continue
      const cn = cnIdx >= 0 ? (r[cnIdx] || '').trim() : ''
      const wiki = wikiIdx >= 0 ? (r[wikiIdx] || '').trim() : ''
      if (existing.has(name)) {
        const t = existing.get(name)
        if (cn) t.cn_name = cn
        if (wiki) t.wiki = wiki
      } else {
        const tag = { id: genId(), name, cn_name: cn, wiki }
        store.tagsData.push(tag)
        existing.set(name, tag)
      }
    }
    await api.putTagsData(store.tagsData)
    toast('CSV 导入成功', 'success')
  } catch (e) {
    toast('CSV 导入失败: ' + e.message, 'error')
  }
}

function copyComposed() {
  const text = composedText.value.trim()
  if (!text) { toast('没有内容可复制', 'warning'); return }
  navigator.clipboard.writeText(text).then(() => toast('已复制到剪贴板', 'success')).catch(() => {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    toast('已复制到剪贴板', 'success')
  })
}

function clearComposed() {
  selectedNotes.value.clear()
  orderedNotes.value = []
  selectedTags.value.clear()
  orderedTags.value = []
  composedText.value = ''
  toast('已清空', 'info')
}

// 监听页签切换
import { watch } from 'vue'
watch(activeTab, () => syncComposed())
</script>

<style scoped>
.composer-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: calc(100vh - 130px);
}
.composer-tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 3px;
}
.composer-tabs button {
  flex: 1;
  padding: 8px 16px;
  border-radius: 9px;
  font-size: 14px;
  color: var(--text-dim);
  transition: all 0.2s;
}
.composer-tabs button.active {
  background: var(--primary);
  color: #fff;
  box-shadow: 0 3px 12px rgba(99, 102, 241, 0.4);
}
.composer-tabs button:hover:not(.active) { color: var(--text); }
.composer-tab-body {
  flex: 1;
  overflow: hidden;
}
.composer-layout {
  display: grid;
  grid-template-columns: 160px 1fr;
  gap: 12px;
  height: 100%;
}
.comp-tag-bar {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  overflow-y: auto;
  max-height: 340px;
}
.comp-tag-bar button {
  display: block;
  width: 100%;
  padding: 7px 10px;
  border-radius: 8px;
  text-align: left;
  font-size: 13px;
  color: var(--text-dim);
  margin-bottom: 2px;
}
.comp-tag-bar button.active {
  background: var(--primary);
  color: #fff;
}
.comp-tag-bar button:hover:not(.active) { background: var(--bg-card); color: var(--text); }
.comp-note-list {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  overflow-y: auto;
  max-height: 340px;
}
.comp-note-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
}
.comp-note-item:hover { background: var(--bg-card); }
.comp-note-item.selected {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.note-order {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.comp-note-info { flex: 1; overflow: hidden; }
.comp-note-name { font-size: 14px; font-weight: 500; }
.comp-note-preview {
  font-size: 12px;
  color: var(--text-faint);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tags-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}
.tags-toolbar .search-box { flex: 1; min-width: 180px; }
.tags-toolbar-btns { display: flex; gap: 4px; }
.tag-list {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 8px;
  overflow-y: auto;
  max-height: 340px;
}
.comp-tag-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  margin-bottom: 2px;
}
.comp-tag-item:hover { background: var(--bg-card); }
.comp-tag-item.selected {
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.3);
}
.tag-order {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2px;
}
.tag-info { flex: 1; overflow: hidden; }
.tag-name { font-size: 14px; font-weight: 600; color: var(--text); }
.tag-cn-name { font-size: 12px; color: var(--text-dim); }
.tag-detail {
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 4px;
  padding: 4px 8px;
  background: var(--bg-input);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-word;
}
.tag-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.tag-action {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  font-size: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-faint);
  opacity: 0.6;
}
.tag-action:hover { opacity: 1; background: var(--bg-card-hover); }
.composer-result {
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
}
.composer-result textarea {
  width: 100%;
  min-height: 100px;
  border: 1px solid var(--border);
  border-radius: 9px;
  padding: 10px;
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}
.composer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.composer-stat {
  font-size: 12px;
  color: var(--text-faint);
  margin-left: auto;
}
</style>
