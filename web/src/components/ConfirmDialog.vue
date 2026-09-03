<template>
  <div class="modal-overlay" @click.self="cancel">
    <div class="modal confirm-modal">
      <div class="modal-header">
        <span>{{ store.confirm.title }}</span>
        <button class="modal-close" @click="cancel">✕</button>
      </div>
      <div class="modal-body">
        <p class="confirm-message">{{ store.confirm.message }}</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="cancel">取消</button>
        <button class="btn" :class="store.confirm.danger ? 'btn-danger' : 'btn-primary'" @click="confirm">
          确认
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { store } from '../store'

function confirm() {
  const cb = store.confirm?.onConfirm
  store.confirm = null
  if (cb) cb()
}
function cancel() {
  store.confirm = null
}
</script>

<style scoped>
.confirm-modal { width: 400px; }
.confirm-message {
  font-size: 14px;
  color: var(--text);
  line-height: 1.6;
  word-break: break-word;
}
.modal-close {
  font-size: 14px;
  color: var(--text-faint);
  width: 28px;
  height: 28px;
  border-radius: 8px;
}
.modal-close:hover { background: var(--bg-card); color: var(--text); }
</style>
