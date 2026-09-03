// ---------- 通用工具 ----------

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 8)
}

export function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

export function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// 下载文件
export function downloadFile(filename, content, mime = 'application/json') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- CSV 工具 ----------
export function escapeCSVField(field) {
  const s = String(field == null ? '' : field)
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export function parseCSV(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++ }
        else inQuotes = false
      } else cur += c
    } else {
      if (c === '"') inQuotes = true
      else if (c === ',') { row.push(cur); cur = '' }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++
        row.push(cur); cur = ''
        rows.push(row); row = []
      } else cur += c
    }
  }
  if (cur.length > 0 || row.length > 0) { row.push(cur); rows.push(row) }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''))
}

export function toCSV(headers, rows) {
  const lines = [headers.map(escapeCSVField).join(',')]
  for (const r of rows) {
    lines.push(headers.map((_, i) => escapeCSVField(r[i] || '')).join(','))
  }
  return lines.join('\n')
}

// ---------- 编码检测与解码 ----------
// 自动识别 UTF-8 / GB18030(GBK) 编码，解决中文乱码问题
export async function decodeFileText(file) {
  const buf = await file.arrayBuffer()
  // 去除 UTF-8 BOM
  if (buf.byteLength >= 3 && new Uint8Array(buf, 0, 3).join(',') === '239,187,191') {
    return new TextDecoder('utf-8').decode(buf.slice(3))
  }
  // 尝试严格 UTF-8 解码；失败则回退 GB18030（兼容 GBK/GB2312）
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    try {
      return new TextDecoder('gb18030').decode(buf)
    } catch {
      return new TextDecoder('utf-8').decode(buf)
    }
  }
}

// ---------- 简易 Markdown 渲染（渲染为 HTML） ----------
// 基于 DOM 的安全渲染方式：先转义，再按行解析，再对行内代码/加粗等做受控替换
export function markdownToHtml(md) {
  if (!md) return ''
  const esc = (s) => escapeHtml(s)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '') // 移除图片，防追踪
  const lines = esc(md).split('\n')
  const html = []
  let inCode = false
  let codeLang = ''
  let codeBuf = []
  let listType = null // 'ul' | 'ol'
  let table = null

  const flushList = () => {
    if (listType) { html.push(`</${listType}>`); listType = null }
  }
  const flushTable = () => {
    if (table) { html.push('</tbody></table>'); table = null }
  }
  const inline = (s) => {
    // 行内代码
    let out = s.replace(/`([^`]+)`/g, '<code>$1</code>')
    // 粗体
    out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // 斜体
    out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    // 链接
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    return out
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // 代码块
    if (/^```/.test(line.trim())) {
      if (!inCode) {
        flushList(); flushTable()
        inCode = true
        codeLang = line.trim().replace(/^```/, '').trim()
        codeBuf = []
        html.push(`<div class="md-codeblock"><div class="md-code-header"><span>${escapeHtml(codeLang || 'code')}</span><button class="md-code-copy" type="button">复制</button></div><pre><code class="lang-${escapeHtml(codeLang)}">`)
      } else {
        inCode = false
        html.push(escapeHtml(codeBuf.join('\n')) + '</code></pre></div>')
        codeBuf = []
      }
      continue
    }
    if (inCode) { codeBuf.push(line); continue }

    // 表格
    if (/^\s*\|.*\|\s*$/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      if (/^[-:]+$/.test(cells.join(''))) {
        // 分隔行，跳过（已在表头记录）
        continue
      }
      if (!table) {
        flushList()
        table = { headers: cells }
        html.push('<table><thead><tr>')
        cells.forEach(h => html.push('<th>' + inline(h) + '</th>'))
        html.push('</tr></thead><tbody>')
      } else {
        html.push('<tr>')
        cells.forEach(c => html.push('<td>' + inline(c) + '</td>'))
        html.push('</tr>')
      }
      continue
    }
    flushTable()

    // 标题
    const h = line.match(/^(#{1,6})\s+(.*)/)
    if (h) {
      flushList()
      const level = h[1].length
      html.push(`<h${level}>${inline(h[2])}</h${level}>`)
      continue
    }

    // 分割线
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      flushList()
      html.push('<hr/>')
      continue
    }

    // 引用
    if (/^\s*&gt;\s?/.test(line) || /^\s*>\s?/.test(line)) {
      flushList()
      html.push('<blockquote>' + inline(line.replace(/^\s*&gt;\s?/, '')) + '</blockquote>')
      continue
    }

    // 列表
    const ul = line.match(/^\s*[-*+]\s+(.*)/)
    const ol = line.match(/^\s*\d+\.\s+(.*)/)
    if (ul || ol) {
      const newType = ul ? 'ul' : 'ol'
      if (listType !== newType) {
        flushList()
        listType = newType
        html.push(`<${newType}>`)
      }
      html.push(`<li>${inline((ul ? ul[1] : ol[1]))}</li>`)
      continue
    }
    flushList()

    // 空行
    if (line.trim() === '') { html.push('<br/>'); continue }

    // 普通段落
    html.push('<p>' + inline(line) + '</p>')
  }
  flushList(); flushTable()
  if (inCode) {
    html.push(escapeHtml(codeBuf.join('\n')) + '</code></pre></div>')
  }
  return html.join('')
}

// 给渲染后的 HTML 绑定代码块复制按钮
export function bindCodeCopy(rootEl) {
  if (!rootEl) return
  rootEl.querySelectorAll('.md-code-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      const pre = btn.closest('.md-codeblock')?.querySelector('code')
      if (pre) {
        navigator.clipboard.writeText(pre.textContent || '').catch(() => {})
        const old = btn.textContent
        btn.textContent = '已复制 ✓'
        setTimeout(() => { btn.textContent = old }, 1200)
      }
    })
  })
}

// ---------- 设备检测 ----------
export function isMobileDevice() {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 0 && window.innerWidth < 768)
}