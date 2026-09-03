<template>
  <div class="note-card" :class="{ selected: note._selected }" @click="onClick">
    <div class="note-card-header">
      <span class="note-card-name" :title="note.name">{{ note.name }}</span>
      <div class="note-card-actions" v-if="isAdmin">
        <button class="note-action" @click.stop="emitEdit" title="编辑">✏️</button>
        <button class="note-action" @click.stop="emitDelete" title="删除">🗑️</button>
      </div>
    </div>
    <div class="note-card-preview" :title="note.content">
      {{ note.content || '…' }}
    </div>
    <div class="note-card-footer">
      <button class="card-btn" @click.stop="onCopy" title="复制内容">📋 复制</button>
      <button class="card-btn" @click.stop="onViewFull" title="查看全文">🔍 查看</button>
    </div>
  </div>
</template>

<script setup>
import { defineProps, defineEmits } from 'vue'
import { store, toast } from '../store'
import { api } from '../api'

const props = defineProps({
  note: { type: Object, required: true },
  isAdmin: Boolean,
  tagId: String
})

const emit = defineEmits(['refresh'])

function onClick() {
  // 点击卡片选中（用于复制）
  store.search = '' // 不干扰搜索
}

function emitEdit() {
  // 通过 window 事件通知 NotesView 打开编辑
  window.dispatchEvent(new CustomEvent('pp-edit-note', { detail: props.note }))
}

function emitDelete() {
  // 删除
  if (confirm(`确定删除便签「${props.note.name}」？`)) {
    doDelete()
  }
}

async function doDelete() {
  const tags = JSON.parse(JSON.stringify(store.main.tags))
  const tag = tags.find(t => t.id === props.tagId)
  if (!tag) return
  const idx = tag.notes.findIndex(n => n.id === props.note.id)
  if (idx < 0) return
  tag.notes.splice(idx, 1)
  store.main.tags = tags
  try {
    await api.putData({ tags: store.main.tags })
    toast('便签已删除', 'success')
    emit('refresh')
  } catch (e) {
    toast('删除失败: ' + e.message, 'error')
  }
}

async function onCopy() {
  try {
    await navigator.clipboard.writeText(props.note.content || '')
    toast('已复制到剪贴板', 'success')
  } catch {
    // fallback
    const ta = document.createElement('textarea')
    ta.value = props.note.content || ''
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    document.execCommand('copy')
    document.body.removeChild(ta)
    toast('已复制到剪贴板', 'success')
  }
}

function onViewFull() {
  const modal = document.createElement('div')
  modal.className = 'modal-overlay'
  modal.style.cssText = 'position:fixed;inset:0;background:rgba(5,7,12,0.7);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;z-index:2000'
  modal.innerHTML = `
    <div class="modal" style="width:600px;max-height:70vh;display:flex;flex-direction:column;background:var(--bg-soft);border:1px solid var(--border);border-radius:18px;box-shadow:0 16px 50px rgba(0,0,0,0.5)">
      <div class="modal-header" style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)">
        <span style="font-weight:600;font-size:16px">${escapeHtml(props.note.name)}</span>
        <button class="modal-close" style="font-size:14px;color:var(--text-faint);width:28px;height:28px;border-radius:8px" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="modal-body" style="padding:20px;overflow-y:auto;white-space:pre-wrap;word-break:break-word;line-height:1.7;font-size:14px;color:var(--text)">${escapeHtml(props.note.content || '（空）')}</div>
      <div class="modal-footer" style="padding:14px 20px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;gap:10px">
        <button class="btn btn-primary btn-sm" onclick="navigator.clipboard.writeText(this.closest('.modal').querySelector('.modal-body').textContent)">📋 复制内容</button>
        <button class="btn btn-ghost btn-sm" onclick="this.closest('.modal-overlay').remove()">关闭</button>
      </div>
    </div>`
  document.body.appendChild(modal)
}

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}
</script>

<style scoped>
.note-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  transition: all 0.2s;
  cursor: default;
}
.note-card:hover {
  border-color: var(--border-light);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
  transform: translateY(-1px);
}
.note-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px rgba(99, 102, 241, 0.3);
}
.note-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
}
.note-card-name {
  font-weight: 600;
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.note-card-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}
.note-action {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s;
  color: var(--text-faint);
}
.note-card:hover .note-action { opacity: 1; }
.note-action:hover { background: var(--bg-card-hover); color: var(--text); }
.note-card-preview {
  color: var(--text-dim);
  font-size: 13px;
  line-height: 1.5;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  word-break: break-word;
  flex: 1;
  min-height: 54px;
}
.note-card-footer {
  display: flex;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.card-btn {
  flex: 1;
  padding: 5px 0;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-dim);
  transition: all 0.15s;
}
.card-btn:hover { background: var(--bg-card-hover); color: var(--text); }
</style>