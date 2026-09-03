# 🎨 PromptPalette Web - 提示词便签管家（云端版）

将油猴脚本 [PromptPalette](../提示词脚本/PromptPalette.js) 完整复刻为 **Web 应用**，部署在 Cloudflare Workers（免费），使用 **Cloudflare KV** 作为数据存储。

## 🚀 在线访问

| 站点 | 地址 | 说明 |
| :--- | :--- | :--- |
| **线上主站** | https://palette.lunisolar.de5.net | Cloudflare Worker，完整功能（含管理员） |
| **GitHub 演示站** | https://dming623.github.io/prompt-palette-web/ | 静态演示，跨域调用主站 API（游客模式） |

> 演示站部署于 GitHub Pages（`gh-pages` 分支），前端自动检测所处域名，跨域访问线上 Worker API，体验完整游客功能（浏览/组合/自带 Key 使用 AI）。

## 功能特性

| 模块 | 说明 |
| :--- | :--- |
| 📋 **便签管理** | 标签分类 + 便签增删改查、搜索过滤、剪贴板复制 |
| 🧩 **组合面板** | 便签组合 + 独立 Tag 组合（name/cn_name/wiki 三项）、CSV 导入导出 |
| 🤖 **AI 助手** | OpenAI 兼容接口、SSE 流式输出、工具调用（function calling）、MCP (streamhttp) 协议、多对话历史 |
| 📤 **导入导出** | 管理员可导出/导入完整数据 JSON 备份 |

## 权限模型（单管理员 + 游客只读）

| 能力 | 游客 | 管理员 |
| :--- | :---: | :---: |
| 查看标签/便签/独立 Tag | ✅ | ✅ |
| 便签组合 / Tag 组合 / 复制 | ✅ | ✅ |
| AI 对话 | ✅（必须自带 API URL + Key） | ✅（使用环境变量配置） |
| 增删改标签/便签/独立 Tag | ❌ | ✅ |
| 导入导出 JSON 备份 | ❌ | ✅ |
| AI 工具调用 | 只读工具（查看/搜索） | 读写工具（增/删/改数据） |

> **安全要点**：游客的 AI 请求携带的是**游客自己的** `X-API-URL` / `X-API-Key` 请求头，后端仅做透传代理，绝不注入管理员的密钥；写操作端点全部要求管理员 Cookie 鉴权。

## 项目结构

```
prompt-palette-web/
├── wrangler.toml.example  # 配置模板（复制为 wrangler.toml 后填写；真实配置已被 gitignore，不会上传）
├── worker/
│   └── index.js           # 后端 API（认证 / KV CRUD / AI 代理 / MCP 代理 / 静态资源）
└── web/                   # 前端（Vue 3 + Vite）
    ├── src/
    │   ├── App.vue            # 主布局 + 导航
    │   ├── store.js           # 全局状态
    │   ├── api.js             # API 客户端（自动检测部署域 + SSE 流式解析）
    │   ├── utils.js           # Markdown 渲染 / CSV 解析等
    │   └── components/
    │       ├── NotesView.vue      # 便签管理（标签栏 + 便签网格）
    │       ├── ComposerView.vue   # 组合面板（便签/Tag 组合）
    │       ├── AiView.vue         # AI 对话（多会话历史）
    │       ├── AiSettingsModal.vue# AI 设置（管理员/游客）
    │       ├── LoginModal.vue     # 管理员登录
    │       └── ConfirmDialog.vue  # 确认框
```

## 部署步骤

### 1. 准备环境

- 安装 [Node.js](https://nodejs.org/) (>= 18)
- 安装 [wrangler CLI](https://developers.cloudflare.com/workers/wrangler/) 并登录 Cloudflare：
  ```bash
  npm install -g wrangler
  wrangler login
  ```

### 2. 初始化配置

```bash
cd prompt-palette-web
# 复制配置模板并填写
cp wrangler.toml.example wrangler.toml
# 创建 KV 命名空间，把输出的 id 填入 wrangler.toml
wrangler kv namespace create KV
```

### 3. 配置环境变量（secrets）

```bash
# 管理员账号密码（必填）
wrangler secret put ADMIN_USERNAME
wrangler secret put ADMIN_PASSWORD

# 管理员 AI 配置（必填，OpenAI 兼容接口）
wrangler secret put AI_API_URL      # 例如 https://api.openai.com/v1/chat/completions
wrangler secret put AI_API_KEY

# 会话签名密钥（强烈建议，随机字符串即可）
wrangler secret put SESSION_SECRET
```

### 4. 构建并部署

```bash
# 安装前端依赖
cd web && npm install && cd ..

# 一条命令部署（自动构建前端 + 部署 Worker）
npm run deploy
```

### 5. 本地开发调试

```bash
cd prompt-palette-web

# 终端1：启动前端开发服务器（代理 /api 到本地 worker）
cd web && npm run dev

# 终端2：启动本地 Worker（需要先完成步骤 2、3）
wrangler dev
```

> 本地调试时 Cookie 不带 `Secure` 属性，登录可正常工作；线上 HTTPS 自动加 `Secure`；跨域调用（如 GitHub Pages 演示站）自动使用 `SameSite=None; Secure`。

### 6. 部署 GitHub Pages 演示站（可选）

```bash
# 构建前端产物（vite base 已设为相对路径 ./，兼容子路径）
cd web && npm run build && cd ..

# 将产物推送到 gh-pages 分支（仓库 Pages 已配置该分支）
git subtree push --prefix web/dist origin gh-pages
```

> 演示站前端自动检测域名：在 Worker 主域上则同域调用 `/api`；在 GitHub Pages 等外部域则跨域调用线上 Worker API（CORS 已配置）。

## 环境变量一览

| 变量 | 类型 | 必填 | 说明 |
| :--- | :--- | :---: | :--- |
| `ADMIN_USERNAME` | Secret | ✅ | 管理员用户名 |
| `ADMIN_PASSWORD` | Secret | ✅ | 管理员密码 |
| `AI_API_URL` | Secret | ✅ | OpenAI 兼容 chat/completions 地址（管理员专用） |
| `AI_API_KEY` | Secret | ✅ | 管理员 API 密钥 |
| `SESSION_SECRET` | Secret | ⭐ | 会话签名密钥（不设则用 ADMIN_PASSWORD 派生） |
| `AI_MODEL` | Var | ❌ | 管理员默认模型名，留空用接口默认 |

## API 一览

| 方法 | 路径 | 权限 | 说明 |
| :--- | :--- | :--- | :--- |
| GET | `/api/health` | 公开 | 健康检查 |
| POST | `/api/auth/login` | 公开 | 管理员登录（设 HttpOnly Cookie） |
| POST | `/api/auth/logout` | 公开 | 登出 |
| GET | `/api/auth/me` | 公开 | 当前身份（admin/visitor） |
| GET | `/api/data` | 公开 | 读取主数据（标签/便签） |
| PUT | `/api/data` | 管理员 | 写入主数据 |
| GET | `/api/tags-data` | 公开 | 读取独立 Tag 数据 |
| PUT | `/api/tags-data` | 管理员 | 写入独立 Tag 数据 |
| GET | `/api/export` | 管理员 | 导出完整备份 |
| POST | `/api/import` | 管理员 | 导入备份 |
| POST | `/api/ai/chat` | 公开* | AI 对话（管理员用环境变量；游客用请求头自带 Key） |
| POST | `/api/ai/mcp/init` | 公开* | MCP initialize 代理 |
| POST | `/api/ai/mcp/list` | 公开* | MCP tools/list 代理 |
| POST | `/api/ai/mcp/call` | 公开* | MCP tools/call 代理 |

\* `/api/ai/*` 中：管理员通过 Cookie 认证后后端自动注入环境变量密钥；游客需在请求头携带 `X-API-URL` 和 `X-API-Key`。

## 数据迁移（从油猴脚本导入）

1. 在 Tampermonkey 中打开旧脚本，点击 📤 导出 JSON，得到备份文件（`tags` + `ui` 结构）。
2. 管理员登录 Web 版 → 顶部「📥 导入」选择该 JSON 即可。
   > 导入端会自动识别旧格式（含 `ui` 字段），仅提取 `tags` 部分。
3. 独立 Tag 数据（CSV）可在「🧩 组合 → Tag 组合 → 📥 导入 CSV」中导入。

## 常见问题

**Q1: KV 免费额度够用吗？**
够。Workers 免费版 KV：每日 10 万次读取、1000 次写入、1GB 存储。本应用每次刷新仅 2 次读（主数据 + Tag 数据），写操作只在管理员增删改时发生。

**Q2: 管理员登录不上？**
确认 `ADMIN_USERNAME` / `ADMIN_PASSWORD` 已通过 `wrangler secret put` 设置。本地调试时用 `--var` 传入。

**Q3: AI 请求 401？**
- 管理员：确认 `AI_API_URL`（完整 chat/completions 地址）和 `AI_API_KEY` 正确。
- 游客：在 ⚙️ AI 设置中填写自己的 URL 和 Key，或直接调用 API 时带 `X-API-URL` / `X-API-Key` 头。

**Q4: 工具调用（AI 读写便签）怎么生效？**
需在 AI 设置中开启「启用工具调用」。管理员可增删改；游客仅可查看/搜索（写工具不会下发）。工具模式下后端使用非流式循环，最终结果以流式模拟输出。

**Q5: 数据存在哪？**
全部存在 Cloudflare KV（`main_data` / `tags_data` 两个键）。对话历史存在浏览器 localStorage。建议定期管理员「📤 导出」备份。

## 版本

v1.0.0 - 初始版本，完整复刻 PromptPalette v7.0 功能。
