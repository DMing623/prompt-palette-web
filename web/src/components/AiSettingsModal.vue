<template>
  <div class="modal-overlay" @click.self="$emit('close')">
    <div class="modal settings-modal">
      <div class="modal-header">
        <span>⚙️ AI 设置</span>
        <button class="modal-close" @click="$emit('close')">✕</button>
      </div>
      <div class="modal-body">
        <!-- 管理员 AI 设置 -->
        <template v-if="isAdmin">
          <div class="settings-section">
            <h3>管理员 AI 配置</h3>
            <p class="settings-hint">使用环境变量中的 API 地址和密钥，无需手动填写</p>
            <div class="field-hint" style="margin-bottom:12px;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:1px solid var(--border)">
              AI 地址和密钥已在 Cloudflare 环境变量中配置，此处仅可设置其他参数。
            </div>
            <div class="field">
              <label>默认模型（留空使用接口默认）</label>
              <input v-model="adminModel" placeholder="如 gpt-4o-mini" />
            </div>
            <div class="field">
              <label>采样温度 (0-2)</label>
              <div class="field-row">
                <input v-model.number="adminTemp" type="range" min="0" max="2" step="0.1" />
                <span class="range-val">{{ adminTemp }}</span>
              </div>
            </div>
            <div class="field">
              <label class="checkbox-label">
                <span class="switch">
                  <input v-model="adminStream" type="checkbox" />
                  <span class="slider"></span>
                </span>
                流式输出
              </label>
            </div>
            <div class="field">
              <label class="checkbox-label">
                <span class="switch">
                  <input v-model="adminTools" type="checkbox" />
                  <span class="slider"></span>
                </span>
                启用工具调用（AI 可读写便签数据）
              </label>
            </div>
            <div class="field">
              <label>上下文轮次限制（0=全部）</label>
              <input v-model.number="adminContextLimit" type="number" min="0" max="100" />
            </div>
            <div class="field">
              <label>自定义 System Prompt</label>
              <textarea v-model="adminSystemPrompt" rows="4" placeholder="你是一个有用的提示词助手…"></textarea>
            </div>
            <hr class="settings-divider" />
            <h3>MCP 配置</h3>
            <div class="field">
              <label class="checkbox-label">
                <span class="switch">
                  <input v-model="adminMcpEnabled" type="checkbox" />
                  <span class="slider"></span>
                </span>
                启用 MCP 工具
              </label>
            </div>
            <div class="field">
              <label>MCP Streamable HTTP 端点</label>
              <input v-model="adminMcpUrl" placeholder="https://example.com/mcp" />
            </div>
            <div class="field">
              <label>MCP 请求头（JSON 格式，如鉴权）</label>
              <textarea v-model="adminMcpHeaders" rows="2" placeholder='{"Authorization": "Bearer xxx"}'></textarea>
            </div>
          </div>
        </template>

        <!-- 游客 AI 设置 -->
        <template v-else>
          <div class="settings-section">
            <h3>游客 AI 配置</h3>
            <p class="settings-hint">请填写你的 OpenAI 兼容 API 地址和密钥</p>
            <div class="field">
              <label>API 地址（完整 URL）</label>
              <input v-model="store.visitorAi.url" placeholder="https://api.openai.com/v1/chat/completions" />
            </div>
            <div class="field">
              <label>API 密钥</label>
              <input v-model="store.visitorAi.key" type="password" placeholder="sk-..." />
            </div>
            <div class="field">
              <label>模型</label>
              <input v-model="store.visitorAi.model" placeholder="如 gpt-4o-mini（留空使用接口默认）" />
            </div>
            <div class="field">
              <label>采样温度 (0-2)</label>
              <div class="field-row">
                <input v-model.number="store.visitorAi.temperature" type="range" min="0" max="2" step="0.1" />
                <span class="range-val">{{ store.visitorAi.temperature }}</span>
              </div>
            </div>
            <div class="field">
              <label class="checkbox-label">
                <span class="switch">
                  <input v-model="store.visitorAi.stream" type="checkbox" />
                  <span class="slider"></span>
                </span>
                流式输出
              </label>
            </div>
            <div class="field">
              <label class="checkbox-label">
                <span class="switch">
                  <input v-model="store.visitorAi.toolsEnabled" type="checkbox" />
                  <span class="slider"></span>
                </span>
                启用工具调用（AI 可查看便签数据）
              </label>
            </div>
            <div class="field">
              <label>上下文轮次限制（0=全部）</label>
              <input v-model.number="store.visitorAi.contextLimit" type="number" min="0" max="100" />
            </div>
            <div class="field">
              <label>自定义 System Prompt</label>
              <textarea v-model="store.visitorAi.systemPrompt" rows="4" placeholder="你是一个有用的提示词助手…"></textarea>
            </div>
            <hr class="settings-divider" />
            <h3>MCP 配置</h3>
            <div class="field">
              <label class="checkbox-label">
                <span class="switch">
                  <input v-model="store.visitorAi.mcpEnabled" type="checkbox" />
                  <span class="slider"></span>
                </span>
                启用 MCP 工具
              </label>
            </div>
            <div class="field">
              <label>MCP Streamable HTTP 端点</label>
              <input v-model="store.visitorAi.mcpUrl" placeholder="https://example.com/mcp" />
            </div>
            <div class="field">
              <label>MCP 请求头（JSON 格式，如鉴权）</label>
              <textarea v-model="store.visitorAi.mcpHeaders" rows="2" placeholder='{"Authorization": "Bearer xxx"}'></textarea>
            </div>
          </div>
        </template>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" @click="$emit('close')">关闭</button>
        <button class="btn btn-primary" @click="saveSettings">保存设置</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { store, saveVisitorAi, toast } from '../store'

const props = defineProps({
  isAdmin: Boolean
})
const emit = defineEmits(['close'])

// 管理员 AI 设置（存 localStorage）
const adminModel = ref('')
const adminTemp = ref(0.7)
const adminStream = ref(true)
const adminTools = ref(true)
const adminContextLimit = ref(0)
const adminSystemPrompt = ref('')
const adminMcpEnabled = ref(false)
const adminMcpUrl = ref('')
const adminMcpHeaders = ref('')

const ADMIN_PREFIX = 'pp_admin_'

onMounted(() => {
  if (props.isAdmin) {
    adminModel.value = localStorage.getItem(ADMIN_PREFIX + 'ai_model') || ''
    adminTemp.value = parseFloat(localStorage.getItem(ADMIN_PREFIX + 'temperature') || '0.7')
    adminStream.value = localStorage.getItem(ADMIN_PREFIX + 'stream') !== 'false'
    adminTools.value = localStorage.getItem(ADMIN_PREFIX + 'tools_enabled') !== 'false'
    adminContextLimit.value = parseInt(localStorage.getItem(ADMIN_PREFIX + 'context_limit') || '0')
    adminSystemPrompt.value = localStorage.getItem(ADMIN_PREFIX + 'system_prompt') || ''
    adminMcpEnabled.value = localStorage.getItem(ADMIN_PREFIX + 'mcp_enabled') === 'true'
    adminMcpUrl.value = localStorage.getItem(ADMIN_PREFIX + 'mcp_url') || ''
    adminMcpHeaders.value = localStorage.getItem(ADMIN_PREFIX + 'mcp_headers') || ''
  }
})

function saveSettings() {
  if (props.isAdmin) {
    localStorage.setItem(ADMIN_PREFIX + 'ai_model', adminModel.value)
    localStorage.setItem(ADMIN_PREFIX + 'temperature', String(adminTemp.value))
    localStorage.setItem(ADMIN_PREFIX + 'stream', String(adminStream.value))
    localStorage.setItem(ADMIN_PREFIX + 'tools_enabled', String(adminTools.value))
    localStorage.setItem(ADMIN_PREFIX + 'context_limit', String(adminContextLimit.value))
    localStorage.setItem(ADMIN_PREFIX + 'system_prompt', adminSystemPrompt.value)
    localStorage.setItem(ADMIN_PREFIX + 'mcp_enabled', String(adminMcpEnabled.value))
    localStorage.setItem(ADMIN_PREFIX + 'mcp_url', adminMcpUrl.value)
    localStorage.setItem(ADMIN_PREFIX + 'mcp_headers', adminMcpHeaders.value)
  } else {
    saveVisitorAi()
  }
  toast('设置已保存', 'success')
  emit('close')
}
</script>

<style scoped>
.settings-modal { width: 560px; }
.settings-modal .modal-body { max-height: 65vh; }
.settings-section h3 { font-size: 16px; font-weight: 600; margin-bottom: 12px; }
.settings-hint { font-size: 13px; color: var(--text-faint); margin-bottom: 16px; }
.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.field-row input[type="range"] { flex: 1; }
.range-val {
  min-width: 32px;
  text-align: center;
  font-size: 13px;
  color: var(--text-dim);
  font-family: var(--mono);
}
.checkbox-label {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  font-size: 14px;
  user-select: none;
}
.settings-divider {
  border: none;
  border-top: 1px solid var(--border);
  margin: 20px 0;
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
