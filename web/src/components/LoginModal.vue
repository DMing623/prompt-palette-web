<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal login-modal">
      <div class="modal-header">
        <span>管理员登录</span>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <div class="login-icon">🔐</div>
        <div class="field">
          <label>用户名</label>
          <input v-model="username" placeholder="管理员用户名" @keyup.enter="doLogin" autofocus />
        </div>
        <div class="field">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="管理员密码" @keyup.enter="doLogin" />
        </div>
        <div v-if="error" class="login-error">{{ error }}</div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="doLogin" :disabled="loading || !username || !password">
          {{ loading ? '登录中…' : '登录' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { api } from '../api'
import { store, toast } from '../store'

const emit = defineEmits(['close', 'login'])
const username = ref('')
const password = ref('')
const loading = ref(false)
const error = ref('')

async function doLogin() {
  if (!username.value || !password.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await api.login(username.value.trim(), password.value)
    store.role = 'admin'
    toast('登录成功，欢迎管理员！', 'success')
    emit('login')
    emit('close')
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.login-modal { width: 380px; }
.login-icon {
  font-size: 44px;
  text-align: center;
  margin: 6px 0 18px;
}
.login-error {
  background: rgba(248, 113, 113, 0.1);
  border: 1px solid rgba(248, 113, 113, 0.3);
  color: var(--danger);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin-top: 4px;
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
