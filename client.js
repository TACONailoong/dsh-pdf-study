/**
 * dsh-pdf-study — Browser half.
 *
 * A right-Sidebar page type that reads a PDF and turns a dragged box into a
 * question: the page comes from the Host half's raster route, the box is cropped
 * in the browser, and the crop is sent as an ordinary image prompt on the
 * session, so the answer arrives in the conversation like any other answer.
 *
 * The type reaches the Sidebar through its public seats only: the definition
 * into `ctx.sidebarRightTabs`, the body into the keyed `sidebar.right.pane.tab`
 * seat. One extra entrance sits in the composer dock, because a page type that
 * cannot be found is a page type nobody opens.
 */
window.__ModuleLoader__.load({
  id: 'dsh-pdf-study',
  factory(require) {
    const React = require('react')
    const { useCallback, useEffect, useRef, useState } = React
    const h = React.createElement

    /** Package identity, also the tab type's id. */
    const PLUGIN_ID = 'dsh-pdf-study'
    /** Tab type id; the body and title seats dispatch on it. */
    const TAB_ID = 'dsh-pdf-study.pdf-study'
    /** Page-type discriminator that `openTab` names. */
    const KIND = 'pdf-study'
    /** Copy namespace. */
    const NS = 'pdfStudy'
    /** Host route prefix, identical to the literal in index.js. */
    const ROUTE = '/dsh-pdf-study'
    /** Longest side of a crop image sent to the model. */
    const MAX_IMAGE_SIDE = 2000
    /** Largest PNG kept as PNG; a bigger crop is re-encoded as JPEG. */
    const MAX_IMAGE_BYTES = 3_800_000
    /** Shortest drag that counts as a selection, in CSS pixels. */
    const MIN_DRAG_PX = 12

    /* ------------------------------------------------------------------ copy */

    const zh = {
      'tab.title': 'PDF 精读',
      'guide.title': 'PDF 精读',
      'guide.description': '导入 PDF，框选任意区域提问',
      'dock.label': 'PDF 精读',
      'dock.hint': '在右侧栏打开 PDF 精读',
      'empty.hint': '在页面上按住鼠标拖出一个框，就能针对这块内容提问；回答会出现在对话里。',
      'empty.step1': '导入一份 PDF',
      'empty.step2': '框选页面上任意区域',
      'empty.step3': '输入问题，回车发送',
      'empty.pick': '选择 PDF 文件',
      'empty.drop': '把 PDF 拖到这里，或点击选择',
      'opening': '正在解析 PDF…首次渲染需要几秒',
      'rendering': '正在渲染第 {page} 页…',
      'toolbar.prev': '上一页',
      'toolbar.next': '下一页',
      'toolbar.zoomOut': '缩小',
      'toolbar.zoomIn': '放大',
      'toolbar.resetZoom': '适应宽度',
      'toolbar.fit': '适宽',
      'toolbar.replace': '更换 PDF',
      'select.hint': '拖拽框选',
      'ask.title': '就这块内容提问',
      'ask.pageLabel': '第 {page} 页',
      'ask.croppingShort': '截取中…',
      'ask.placeholder': '想问什么？留空则请助手讲解这块内容',
      'ask.defaultQuestion': '请讲解这块内容：它说明了什么，关键概念或公式是什么，并给出一个例子。',
      'ask.send': '提问',
      'ask.sending': '发送中…',
      'ask.cancel': '取消',
      'ask.hint': '选区会作为图片发送，回答显示在对话中',
      'ask.chip.explain': '解释这段',
      'ask.chip.translate': '翻译',
      'ask.chip.solve': '这题怎么解',
      'ask.chip.summary': '总结要点',
      'notice.sent': '已发送，回答见对话',
      'notice.dismiss': '关闭提示',
      'error.retry': '重试',
      'error.open': 'PDF 解析失败',
      'error.page': '这一页渲染失败',
      'error.gone': '这份 PDF 在 Host 上已失效，请重新导入',
      'error.send': '发送失败',
      'error.notPdf': '这不是有效的 PDF 文件',
      'error.tooLarge': 'PDF 文件超过 64 MB 上限',
      'error.network': '没有连上本地渲染服务，请确认 DeepSeek Harness 仍在运行',
      'error.renderer': '当前环境没有可用的文档渲染服务',
      'error.busy': '渲染服务正忙，请稍后重试',
      'error.noSession': '当前会话不可用，无法发送提问',
      'error.crop': '选区截取失败，请重新框选',
      'prompt.header': '【PDF 选区】{file} · 第 {page} 页',
      'prompt.hint': '（这张图是我从 PDF 该页框选出的区域，请只依据图中内容回答；如果信息不足，请说明还需要哪部分。）',
    }

    const en = {
      'tab.title': 'PDF study',
      'guide.title': 'PDF study',
      'guide.description': 'Import a PDF and ask about any selected region',
      'dock.label': 'PDF study',
      'dock.hint': 'Open PDF study in the sidebar',
      'empty.hint': 'Drag a box over any part of the page and ask about it — the answer appears in the conversation.',
      'empty.step1': 'Import a PDF',
      'empty.step2': 'Drag a box over the page',
      'empty.step3': 'Type a question and press Enter',
      'empty.pick': 'Choose a PDF',
      'empty.drop': 'Drop a PDF here, or click to choose one',
      'opening': 'Reading the PDF… the first render takes a few seconds',
      'rendering': 'Rendering page {page}…',
      'toolbar.prev': 'Previous page',
      'toolbar.next': 'Next page',
      'toolbar.zoomOut': 'Zoom out',
      'toolbar.zoomIn': 'Zoom in',
      'toolbar.resetZoom': 'Fit width',
      'toolbar.fit': 'Fit',
      'toolbar.replace': 'Replace PDF',
      'select.hint': 'Drag to select',
      'ask.title': 'Ask about this region',
      'ask.pageLabel': 'Page {page}',
      'ask.croppingShort': 'Capturing…',
      'ask.placeholder': 'What do you want to know? Leave it empty for an explanation.',
      'ask.defaultQuestion': 'Explain this region: what it states, which concepts or formulas it contains, and give one example.',
      'ask.send': 'Ask',
      'ask.sending': 'Sending…',
      'ask.cancel': 'Cancel',
      'ask.hint': 'The region is sent as an image; the answer appears in the conversation',
      'ask.chip.explain': 'Explain',
      'ask.chip.translate': 'Translate',
      'ask.chip.solve': 'Solve it',
      'ask.chip.summary': 'Summarize',
      'notice.sent': 'Sent — see the conversation',
      'notice.dismiss': 'Dismiss',
      'error.retry': 'Retry',
      'error.open': 'The PDF could not be read',
      'error.page': 'This page could not be rendered',
      'error.gone': 'This PDF is no longer open on the Host; import it again',
      'error.send': 'The question could not be sent',
      'error.notPdf': 'This file is not a valid PDF',
      'error.tooLarge': 'The PDF is larger than the 64 MB limit',
      'error.network': 'The local render service did not answer; check that DeepSeek Harness is running',
      'error.renderer': 'No document renderer is available in this profile',
      'error.busy': 'The renderer is busy; try again in a moment',
      'error.noSession': 'This session is unavailable, so the question was not sent',
      'error.crop': 'The region could not be captured; select it again',
      'prompt.header': '[PDF region] {file} · page {page}',
      'prompt.hint': '(This image is the region I selected on that PDF page. Answer only from what the image shows; if it is not enough, say which part is missing.)',
    }

    /* ---------------------------------------------------------------- styles */

    const STYLE = `
.ps-root { display: flex; flex-direction: column; height: 100%; min-height: 0; overflow: hidden; color: var(--dsw-alias-label-primary); font-size: 13px; }
.ps-toolbar { display: flex; align-items: center; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); flex: 0 0 auto; }
.ps-file { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ps-nav { display: flex; align-items: center; gap: 1px; flex: 0 0 auto; }
.ps-count { font-size: 12px; color: var(--dsw-alias-label-secondary); min-width: 44px; text-align: center; font-variant-numeric: tabular-nums; }
.ps-icon { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); cursor: pointer; }
.ps-icon:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.ps-icon:disabled { opacity: .38; cursor: default; }
.ps-zoom { min-width: 42px; height: 22px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; font-variant-numeric: tabular-nums; }
.ps-zoom:hover { border-color: var(--dsw-alias-border-l2); color: var(--dsw-alias-label-primary); }
.ps-canvas { position: relative; flex: 1 1 auto; min-height: 0; overflow: auto; padding: 10px; }
.ps-pagebox { position: relative; margin: 0 auto; background: #fff; box-shadow: 0 1px 4px rgba(15, 23, 32, .18); border-radius: 2px; overflow: hidden; }
.ps-page { display: block; width: 100%; height: auto; user-select: none; -webkit-user-drag: none; }
.ps-layer { position: absolute; inset: 0; cursor: crosshair; touch-action: none; }
.ps-rect { position: absolute; border: 1.5px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color); background: var(--dsw-alias-bg-document-selection); box-shadow: 0 0 0 9999px var(--dsw-alias-bg-mask-2); pointer-events: none; }
.ps-select-hint { position: absolute; top: 16px; left: 50%; transform: translateX(-50%); padding: 2px 9px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 18px; pointer-events: none; }
.ps-busy { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--dsw-alias-bg-layer-1); opacity: .92; color: var(--dsw-alias-label-secondary); font-size: 12px; }
.ps-spinner { width: 14px; height: 14px; margin-right: 8px; border: 2px solid var(--dsw-alias-border-l2); border-top-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); border-radius: 50%; animation: ps-spin .9s linear infinite; }
@keyframes ps-spin { to { transform: rotate(360deg); } }
.ps-empty { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; flex: 1 1 auto; min-height: 0; overflow: auto; padding: 20px 16px; text-align: center; }
.ps-drop { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 100%; padding: 18px 12px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 10px; background: var(--dsw-alias-bg-layer-1); cursor: pointer; }
.ps-drop:hover, .ps-drop-active { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); background: var(--dsw-alias-interactive-bg-hover); }
.ps-drop-title { font-size: 13px; font-weight: 600; }
.ps-drop-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.ps-brand { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.ps-steps { display: flex; flex-direction: column; gap: 6px; width: 100%; margin: 4px 0 0; padding: 0; list-style: none; text-align: left; }
.ps-step { display: flex; align-items: flex-start; gap: 8px; font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.45; }
.ps-step-no { flex: 0 0 auto; width: 16px; height: 16px; margin-top: 1px; border-radius: 50%; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-secondary); font-size: 10px; line-height: 16px; text-align: center; }
.ps-empty-hint { font-size: 12px; color: var(--dsw-alias-label-secondary); line-height: 1.5; }
.ps-ask { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; padding: 10px; border-top: 1px solid var(--dsw-alias-border-l1); background: var(--dsw-alias-bg-layer-1); }
.ps-ask-top { display: flex; align-items: center; gap: 8px; }
.ps-crop { width: 96px; height: 72px; object-fit: contain; border: 1px solid var(--dsw-alias-border-l1); border-radius: 4px; background: #fff; }
.ps-crop-empty { display: flex; align-items: center; justify-content: center; width: 96px; height: 72px; border: 1px dashed var(--dsw-alias-border-l2); border-radius: 4px; font-size: 10px; line-height: 1.3; color: var(--dsw-alias-label-secondary); text-align: center; }
.ps-ask-meta { flex: 1 1 auto; min-width: 0; }
.ps-ask-title { font-size: 12px; font-weight: 600; }
.ps-ask-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.ps-textarea { width: 100%; box-sizing: border-box; min-height: 54px; max-height: 140px; padding: 7px 9px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-base); color: inherit; font: inherit; line-height: 1.45; resize: vertical; }
.ps-textarea:focus { border-color: var(--dsw-alias-brand-primary-new-colorprimary-new-color); }
.ps-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.ps-chip { padding: 2px 8px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 999px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 11px; cursor: pointer; }
.ps-chip:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.ps-actions { display: flex; align-items: center; gap: 8px; }
.ps-hint { flex: 1 1 auto; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.35; }
.ps-btn { flex: 0 0 auto; height: 28px; padding: 0 12px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 7px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; cursor: pointer; }
.ps-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.ps-btn:disabled { opacity: .55; cursor: default; }
.ps-primary { border-color: transparent; background: var(--dsw-alias-brand-primary); color: var(--dsw-alias-label-primary-foreground); }
.ps-primary:hover:not(:disabled) { background: var(--dsw-alias-button-primary-hover); }
.ps-error { display: flex; align-items: flex-start; gap: 6px; font-size: 11px; line-height: 1.4; color: var(--dsw-alias-state-error-primary); }
.ps-banner { flex: 0 0 auto; display: flex; align-items: flex-start; gap: 8px; margin: 8px 10px 0; padding: 6px 8px; border: 1px solid var(--dsw-alias-border-l1); border-left: 2px solid var(--dsw-alias-state-error-primary); border-radius: 6px; font-size: 11px; line-height: 1.4; color: var(--dsw-alias-state-error-primary); }
.ps-banner-text { flex: 1 1 auto; min-width: 0; word-break: break-word; }
.ps-notice { flex: 0 0 auto; margin: 8px 10px 0; padding: 5px 8px; border-radius: 6px; background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-state-success-primary); font-size: 11px; }
.ps-fail { display: flex; flex-direction: column; align-items: center; gap: 8px; height: 100%; justify-content: center; padding: 16px; text-align: center; }
.ps-fail-title { font-size: 12px; font-weight: 600; }
.ps-fail-text { font-size: 11px; color: var(--dsw-alias-label-secondary); line-height: 1.45; word-break: break-word; }
.ps-visually-hidden { position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; }
.ps-dock { display: inline-flex; align-items: center; gap: 6px; height: 22px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: 12px; cursor: pointer; }
.ps-dock:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.ps-dock svg { width: 14px; height: 14px; }
`

    /* --------------------------------------------------------------- helpers */

    /** Clamp a number into a range. */
    function clamp(value, low, high) {
      return Math.min(high, Math.max(low, value))
    }

    /** A stable-enough request identity for one prompt. */
    function newRequestId() {
      const cryptoApi = globalThis.crypto
      if (cryptoApi !== undefined && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID()
      const bytes = new Uint8Array(16)
      if (cryptoApi !== undefined && typeof cryptoApi.getRandomValues === 'function') cryptoApi.getRandomValues(bytes)
      else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
      return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
    }

    /** The browser's IANA time zone, when it has one. */
    function clientTimeZone() {
      try {
        const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
        if (typeof zone === 'string' && zone !== '') return { clientTimeZone: zone }
      } catch {
        // A browser without a usable zone simply omits it.
      }
      return {}
    }

    /** Turn a canvas into a blob of one type. */
    function toBlob(canvas, type, quality) {
      return new Promise(resolve => {
        try {
          canvas.toBlob(blob => resolve(blob), type, quality)
        } catch {
          resolve(null)
        }
      })
    }

    /** Read a blob as a data URL. */
    function readDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('The image could not be read'))
        reader.readAsDataURL(blob)
      })
    }

    /** Release a document the Host holds in memory; kept usable while the page unloads. */
    function releaseDocument(id) {
      try {
        void fetch(ROUTE + '/close', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id }),
          keepalive: true,
        }).catch(() => {})
      } catch {
        // Best effort: the Host evicts documents on its own limits.
      }
    }

    /**
     * Documents one page keeps per Session so closing and reopening the tab
     * returns to the same PDF. The Host owns the bytes; this holds only the
     * descriptor it handed back.
     */
    const openDocuments = new Map()

    /** Crop the selected rectangle out of the rendered page and encode it for the model. */
    async function cropSelection(image, rect) {
      const box = image.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) throw new Error('the page is not laid out')
      const scale = image.naturalWidth / box.width
      const pad = 2
      const sx = clamp(Math.round(rect.x * scale) - pad, 0, Math.max(0, image.naturalWidth - 1))
      const sy = clamp(Math.round(rect.y * scale) - pad, 0, Math.max(0, image.naturalHeight - 1))
      const sw = clamp(Math.round(rect.w * scale) + pad * 2, 1, image.naturalWidth - sx)
      const sh = clamp(Math.round(rect.h * scale) + pad * 2, 1, image.naturalHeight - sy)
      const factor = Math.min(1, MAX_IMAGE_SIDE / Math.max(sw, sh))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(sw * factor))
      canvas.height = Math.max(1, Math.round(sh * factor))
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('no 2D canvas context')
      context.imageSmoothingEnabled = true
      context.imageSmoothingQuality = 'high'
      context.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
      let mediaType = 'image/png'
      let blob = await toBlob(canvas, 'image/png')
      if (blob === null || blob.size > MAX_IMAGE_BYTES) {
        const jpeg = await toBlob(canvas, 'image/jpeg', 0.92)
        if (jpeg !== null && (blob === null || jpeg.size < blob.size)) {
          blob = jpeg
          mediaType = 'image/jpeg'
        }
      }
      if (blob === null) throw new Error('the selection could not be encoded')
      const dataUrl = await readDataUrl(blob)
      return { url: dataUrl, data: dataUrl.slice(dataUrl.indexOf(',') + 1), mediaType, bytes: blob.size }
    }

    /* ----------------------------------------------------------------- icons */

    function icon(paths, size) {
      return h('svg', {
        width: size ?? 14,
        height: size ?? 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': true,
      }, paths)
    }

    const Icons = {
      chevronLeft: () => icon(h('path', { d: 'M10 3.5 5.5 8l4.5 4.5' })),
      chevronRight: () => icon(h('path', { d: 'M6 3.5 10.5 8 6 12.5' })),
      minus: () => icon(h('path', { d: 'M3.5 8h9' })),
      plus: () => icon(h('path', { d: 'M8 3.5v9M3.5 8h9' })),
      replace: () => icon(h('path', { d: 'M13 8a5 5 0 1 1-1.6-3.7M13 2v3.2h-3.2' })),
      close: () => icon(h('path', { d: 'm4 4 8 8M12 4l-8 8' })),
      book: () => h('svg', {
        width: 34,
        height: 34,
        viewBox: '0 0 36 36',
        fill: 'none',
        'aria-hidden': true,
      },
      h('path', { d: 'M9 7.5h13a3 3 0 0 1 3 3v18H12a3 3 0 0 1-3-3z', stroke: 'currentColor', strokeWidth: 1.6, strokeLinejoin: 'round' }),
      h('path', { d: 'M12 7.5v21', stroke: 'currentColor', strokeWidth: 1.6, opacity: .55 }),
      h('rect', { x: 15.5, y: 12.5, width: 8, height: 6, rx: 1.2, stroke: 'currentColor', strokeWidth: 1.5 }),
      h('path', { d: 'M15.5 20.5h8', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' })),
    }

    /* ------------------------------------------------------------ components */

    /** The dropping / picking surface shown before a PDF is loaded. */
    function EmptyState(props) {
      const { t, opening, onFiles } = props
      const inputRef = useRef(null)
      const [dragging, setDragging] = useState(false)

      const pick = useCallback(() => {
        inputRef.current?.click()
      }, [])

      const onDrop = useCallback(event => {
        event.preventDefault()
        setDragging(false)
        const file = event.dataTransfer?.files?.[0]
        if (file !== undefined) onFiles(file)
      }, [onFiles])

      return h('div', { className: 'ps-empty' },
        h('div', { className: 'ps-brand' }, Icons.book()),
        h('div', { className: 'ps-empty-hint' }, t('empty.hint')),
        h('div', {
          className: dragging ? 'ps-drop ps-drop-active' : 'ps-drop',
          role: 'button',
          tabIndex: 0,
          onClick: opening ? undefined : pick,
          onKeyDown: event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              pick()
            }
          },
          onDragOver: event => {
            event.preventDefault()
            setDragging(true)
          },
          onDragLeave: () => setDragging(false),
          onDrop,
        },
        opening
          ? h('div', { className: 'ps-drop-title' }, t('opening'))
          : h('div', { className: 'ps-drop-title' }, t('empty.pick')),
        h('div', { className: 'ps-drop-sub' }, t('empty.drop')),
        h('input', {
          ref: inputRef,
          className: 'ps-visually-hidden',
          type: 'file',
          accept: 'application/pdf,.pdf',
          tabIndex: -1,
          onChange: event => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file !== undefined) onFiles(file)
          },
        })),
        h('ol', { className: 'ps-steps' },
          [t('empty.step1'), t('empty.step2'), t('empty.step3')].map((step, index) =>
            h('li', { className: 'ps-step', key: step },
              h('span', { className: 'ps-step-no' }, String(index + 1)),
              h('span', null, step)))))
    }

    /** The page image with its selection overlay. */
    function PageSurface(props) {
      const { doc, page, zoom, busy, failed, attempt, selected, t, onLoaded, onLoadFailed, onSelect, onClear, onRetry } = props
      const imageRef = useRef(null)
      const layerRef = useRef(null)
      const dragRef = useRef(null)
      const [rect, setRect] = useState(null)
      // The rendered page's own proportions; a document may mix page sizes.
      const [ratio, setRatio] = useState(doc.width > 0 && doc.height > 0 ? doc.width / doc.height : 0.7071)

      // A new page or document clears whatever was selected on the old one.
      useEffect(() => {
        setRect(null)
        dragRef.current = null
        onClear()
      }, [page, doc.id, onClear])

      const localPoint = useCallback((event, drag) => {
        const layer = layerRef.current
        if (layer === null) return drag
        const box = layer.getBoundingClientRect()
        return {
          startX: drag.startX,
          startY: drag.startY,
          x: clamp(event.clientX - box.left, 0, box.width),
          y: clamp(event.clientY - box.top, 0, box.height),
        }
      }, [])

      const onPointerDown = useCallback(event => {
        if (event.button !== 0 || failed !== null) return
        const layer = layerRef.current
        if (layer === null) return
        const box = layer.getBoundingClientRect()
        const startX = clamp(event.clientX - box.left, 0, box.width)
        const startY = clamp(event.clientY - box.top, 0, box.height)
        dragRef.current = { startX, startY }
        try {
          layer.setPointerCapture(event.pointerId)
        } catch {
          // Capture is a nicety; the move handler works without it.
        }
        setRect({ x: startX, y: startY, w: 0, h: 0 })
      }, [failed])

      const onPointerMove = useCallback(event => {
        const drag = dragRef.current
        if (drag === null || drag === undefined || typeof drag !== 'object') return
        const point = localPoint(event, drag)
        setRect({
          x: Math.min(point.startX, point.x),
          y: Math.min(point.startY, point.y),
          w: Math.abs(point.x - point.startX),
          h: Math.abs(point.y - point.startY),
        })
      }, [localPoint])

      const finishDrag = useCallback(event => {
        const drag = dragRef.current
        dragRef.current = null
        const layer = layerRef.current
        if (layer !== null) {
          try {
            layer.releasePointerCapture(event.pointerId)
          } catch {
            // Releasing a capture the browser already dropped is not an error.
          }
        }
        if (drag === null || drag === undefined || typeof drag !== 'object') return
        const point = localPoint(event, drag)
        const next = {
          x: Math.min(point.startX, point.x),
          y: Math.min(point.startY, point.y),
          w: Math.abs(point.x - point.startX),
          h: Math.abs(point.y - point.startY),
        }
        if (next.w < MIN_DRAG_PX || next.h < MIN_DRAG_PX) {
          setRect(null)
          onClear()
          return
        }
        setRect(next)
        const image = imageRef.current
        if (image === null) return
        onSelect(next, image)
      }, [localPoint, onClear, onSelect])

      const handleLoad = useCallback(() => {
        const image = imageRef.current
        if (image !== null && image.naturalWidth > 0 && image.naturalHeight > 0) {
          setRatio(image.naturalWidth / image.naturalHeight)
        }
        onLoaded()
      }, [onLoaded])

      const src = ROUTE + '/page/' + encodeURIComponent(doc.id) + '/' + page + '.png' + (attempt > 0 ? '?v=' + attempt : '')
      const showRect = rect !== null && (rect.w > 0 || rect.h > 0)

      return h('div', { className: 'ps-canvas' },
        h('div', {
          className: 'ps-pagebox',
          style: failed !== null ? { minHeight: '180px' } : { width: zoom === 1 ? '100%' : Math.round(zoom * 100) + '%', aspectRatio: String(ratio) },
        },
        failed === null
          ? h('img', {
            ref: imageRef,
            className: 'ps-page',
            src,
            alt: '',
            draggable: false,
            onLoad: handleLoad,
            onError: onLoadFailed,
          })
          : null,
        failed === null
          ? h('div', {
            ref: layerRef,
            className: 'ps-layer',
            onPointerDown,
            onPointerMove,
            onPointerUp: finishDrag,
            onPointerCancel: finishDrag,
          }, showRect ? h('div', {
            className: 'ps-rect',
            style: { left: rect.x + 'px', top: rect.y + 'px', width: rect.w + 'px', height: rect.h + 'px' },
          }) : null)
          : h('div', { className: 'ps-fail' },
            h('div', { className: 'ps-fail-title' }, t('error.page')),
            h('div', { className: 'ps-fail-text' }, failed),
            h('button', { type: 'button', className: 'ps-btn', onClick: onRetry }, t('error.retry')))),
        busy ? h('div', { className: 'ps-busy' },
          h('span', { className: 'ps-spinner' }),
          h('span', null, t('rendering', { page: String(page) }))) : null,
        !busy && failed === null && !showRect && selected !== true
          ? h('div', { className: 'ps-select-hint' }, t('select.hint'))
          : null)
    }

    /** The bottom sheet that turns one selection into one question. */
    function AskSheet(props) {
      const { t, crop, page, question, sending, error, onQuestion, onSend, onCancel, chips } = props
      const textRef = useRef(null)

      useEffect(() => {
        textRef.current?.focus()
      }, [])

      const putQuestion = useCallback(text => {
        onQuestion(text)
        const field = textRef.current
        if (field !== null) {
          field.focus()
          const end = text.length
          try {
            field.setSelectionRange(end, end)
          } catch {
            // Not a text-selection control in this browser; focus is enough.
          }
        }
      }, [onQuestion])

      return h('div', {
        className: 'ps-ask',
        onKeyDown: event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
        },
      },
        h('div', { className: 'ps-ask-top' },
          crop === null
            ? h('div', { className: 'ps-crop-empty' }, t('ask.croppingShort'))
            : h('img', { className: 'ps-crop', src: crop.url, alt: '' }),
          h('div', { className: 'ps-ask-meta' },
            h('div', { className: 'ps-ask-title' }, t('ask.title')),
            h('div', { className: 'ps-ask-sub' },
              t('ask.pageLabel', { page: String(page) })
              + (crop === null ? '' : ' · ' + Math.max(1, Math.round(crop.bytes / 1024)) + ' KB'))),
          h('button', { type: 'button', className: 'ps-icon', title: t('ask.cancel'), 'aria-label': t('ask.cancel'), onClick: onCancel }, Icons.close())),
        h('textarea', {
          ref: textRef,
          className: 'ps-textarea',
          value: question,
          rows: 2,
          placeholder: t('ask.placeholder'),
          onChange: event => onQuestion(event.target.value),
          onKeyDown: event => {
            const composing = event.nativeEvent?.isComposing === true
              || event.nativeEvent?.keyCode === 229
              || event.isComposing === true
            if (composing) return
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              if (!sending && crop !== null) onSend()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          },
        }),
        h('div', { className: 'ps-chips' },
          chips.map(chip => h('button', {
            key: chip,
            type: 'button',
            className: 'ps-chip',
            onClick: () => putQuestion(chip),
          }, chip))),
        error === null ? null : h('div', { className: 'ps-error', role: 'alert' }, error),
        h('div', { className: 'ps-actions' },
          h('span', { className: 'ps-hint' }, t('ask.hint')),
          h('button', { type: 'button', className: 'ps-btn', onClick: onCancel }, t('ask.cancel')),
          h('button', {
            type: 'button',
            className: 'ps-btn ps-primary',
            disabled: sending || crop === null,
            onClick: onSend,
          }, sending ? t('ask.sending') : t('ask.send'))))
    }

    /** The page type's body: toolbar, page surface, and the ask sheet. */
    function PdfStudyView(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      const sessionId = props.sessionId
      const ask = props.ask

      const [doc, setDoc] = useState(() => {
        const stored = openDocuments.get(sessionId)
        return stored === undefined ? null : { ...stored, restored: true }
      })
      const [page, setPage] = useState(1)
      const [zoom, setZoom] = useState(1)
      const [opening, setOpening] = useState(false)
      const [busy, setBusy] = useState(false)
      const [failed, setFailed] = useState(null)
      const [openError, setOpenError] = useState(null)
      const [selection, setSelection] = useState(null)
      const [crop, setCrop] = useState(null)
      const [question, setQuestion] = useState('')
      const [sending, setSending] = useState(false)
      const [sendError, setSendError] = useState(null)
      const [notice, setNotice] = useState(null)
      const [attempt, setAttempt] = useState(0)
      const docRef = useRef(null)
      const noticeTimer = useRef(0)
      const cropToken = useRef(0)

      useEffect(() => {
        docRef.current = doc
      }, [doc])

      // A retained body follows its Session: switching Sessions must never leave
      // the previous PDF on screen, where its crops would be sent somewhere else.
      const firstSession = useRef(sessionId)
      useEffect(() => {
        if (firstSession.current === sessionId) return
        firstSession.current = sessionId
        cropToken.current += 1
        setSelection(null)
        setCrop(null)
        setQuestion('')
        setSendError(null)
        setOpenError(null)
        setFailed(null)
        const stored = openDocuments.get(sessionId)
        if (stored === undefined) {
          setDoc(null)
          return
        }
        setDoc({ ...stored, restored: true })
        setPage(1)
        setZoom(1)
        setBusy(true)
      }, [sessionId])

      useEffect(() => () => {
        if (noticeTimer.current !== 0) window.clearTimeout(noticeTimer.current)
        // The document stays open on the Host: reopening the tab returns to it,
        // and the Host evicts what nobody touches.
      }, [])

      const flash = useCallback(message => {
        setNotice(message)
        if (noticeTimer.current !== 0) window.clearTimeout(noticeTimer.current)
        noticeTimer.current = window.setTimeout(() => {
          noticeTimer.current = 0
          setNotice(null)
        }, 6000)
      }, [])

      const openFile = useCallback(async file => {
        if (file === undefined || file === null) return
        if (file.type !== 'application/pdf' && !/\.pdf$/iu.test(file.name)) {
          setOpenError(t('error.notPdf'))
          return
        }
        setOpening(true)
        setOpenError(null)
        setSelection(null)
        setCrop(null)
        setSendError(null)
        setFailed(null)
        try {
          const response = await fetch(ROUTE + '/open', {
            method: 'POST',
            headers: { 'content-type': 'application/pdf', 'x-pdf-study-name': encodeURIComponent(file.name) },
            body: file,
          })
          const payload = await response.json().catch(() => null)
          if (!response.ok) {
            const code = payload?.error?.code
            const status = response.status
            const mapped = code === 'not-pdf' ? t('error.notPdf')
              : code === 'too-large' ? t('error.tooLarge')
                : code === 'renderer-unavailable' || status === 503 ? t('error.renderer')
                  : status === 429 ? t('error.busy')
                    : (payload?.error?.message ?? t('error.open'))
            setOpenError(mapped)
            return
          }
          const previous = docRef.current
          openDocuments.set(sessionId, payload)
          setDoc(payload)
          setPage(1)
          setZoom(1)
          setBusy(false)
          if (previous !== null) releaseDocument(previous.id)
        } catch (failure) {
          console.warn('[dsh-pdf-study] the PDF could not be uploaded:', failure)
          setOpenError(t('error.network'))
        } finally {
          setOpening(false)
        }
      }, [sessionId, t])

      const goToPage = useCallback(next => {
        if (doc === null) return
        const target = clamp(next, 1, doc.pages)
        if (target === page) return
        setPage(target)
        setBusy(true)
        setFailed(null)
      }, [doc, page])

      // Warm the neighbouring pages so flipping feels immediate.
      useEffect(() => {
        if (doc === null) return
        for (const neighbour of [page + 1, page - 1]) {
          if (neighbour < 1 || neighbour > doc.pages) continue
          const warm = new Image()
          warm.src = ROUTE + '/page/' + encodeURIComponent(doc.id) + '/' + neighbour + '.png'
        }
      }, [doc, page])

      const onLoaded = useCallback(() => {
        setBusy(false)
        setFailed(null)
        // A restored document becomes an ordinary one once its first page proves
        // the Host still holds the bytes.
        setDoc(current => (current === null || current.restored !== true ? current : { ...current, restored: false }))
      }, [])

      const onLoadFailed = useCallback(async () => {
        setBusy(false)
        const current = docRef.current
        if (current === null) return
        // The Host may have restarted or evicted this document; prove it before
        // offering a retry that could only 404 again.
        let gone = false
        try {
          const probe = await fetch(
            ROUTE + '/page/' + encodeURIComponent(current.id) + '/1.png?probe=' + Date.now(),
            { method: 'HEAD' },
          )
          gone = !probe.ok
        } catch {
          gone = false
        }
        if (gone) {
          openDocuments.delete(sessionId)
          setDoc(null)
          setOpenError(t('error.gone'))
          return
        }
        setFailed(t('error.page'))
      }, [sessionId, t])

      const onSelect = useCallback((rect, image) => {
        cropToken.current += 1
        const token = cropToken.current
        setSelection(rect)
        setCrop(null)
        setQuestion('')
        setSendError(null)
        cropSelection(image, rect)
          .then(result => {
            if (cropToken.current === token) setCrop(result)
          })
          .catch(failure => {
            console.warn('[dsh-pdf-study] the selection could not be captured:', failure)
            if (cropToken.current === token) setSendError(t('error.crop'))
          })
      }, [t])

      const clearSelection = useCallback(() => {
        cropToken.current += 1
        setSelection(null)
        setCrop(null)
        setSendError(null)
      }, [])

      const send = useCallback(async () => {
        if (sending || crop === null || doc === null) return
        if (typeof sessionId !== 'string' || typeof ask !== 'function') {
          setSendError(t('error.noSession'))
          return
        }
        setSending(true)
        setSendError(null)
        try {
          const asked = question.trim() === '' ? t('ask.defaultQuestion') : question.trim()
          const header = t('prompt.header', { file: doc.name, page: String(page) })
          const request = {
            requestId: newRequestId(),
            sessionId,
            mode: 'queue',
            content: [
              { type: 'text', text: header + '\n' + asked + '\n\n' + t('prompt.hint') },
              {
                type: 'image',
                mediaType: crop.mediaType,
                data: crop.data,
                name: 'pdf-page-' + page + (crop.mediaType === 'image/png' ? '.png' : '.jpg'),
              },
            ],
            ...clientTimeZone(),
          }
          const result = await ask(request)
          if (result === undefined || result === null || result.ok !== true) {
            setSendError(t('error.send') + ': ' + (result?.error?.message ?? t('error.network')))
            return
          }
          clearSelection()
          setQuestion('')
          flash(t('notice.sent'))
        } catch (failure) {
          console.warn('[dsh-pdf-study] the question could not be sent:', failure)
          setSendError(t('error.network'))
        } finally {
          setSending(false)
        }
      }, [ask, clearSelection, crop, doc, flash, page, question, sending, sessionId, t])

      const chips = [t('ask.chip.explain'), t('ask.chip.translate'), t('ask.chip.solve'), t('ask.chip.summary')]

      if (doc === null) {
        return h('div', { className: 'ps-root' },
          h(EmptyState, { t, opening, onFiles: openFile }),
          openError === null ? null : h('div', { className: 'ps-error', style: { padding: '0 12px 10px' } }, openError))
      }

      const banner = opening ? t('opening') : openError
      return h('div', { className: 'ps-root' },
        h('div', { className: 'ps-toolbar' },
          h('div', { className: 'ps-file', title: doc.name }, doc.name),
          h('div', { className: 'ps-nav' },
            h('button', {
              type: 'button',
              className: 'ps-icon',
              title: t('toolbar.prev'),
              'aria-label': t('toolbar.prev'),
              disabled: page <= 1,
              onClick: () => goToPage(page - 1),
            }, Icons.chevronLeft()),
            h('span', { className: 'ps-count' }, page + ' / ' + doc.pages),
            h('button', {
              type: 'button',
              className: 'ps-icon',
              title: t('toolbar.next'),
              'aria-label': t('toolbar.next'),
              disabled: page >= doc.pages,
              onClick: () => goToPage(page + 1),
            }, Icons.chevronRight())),
          h('button', {
            type: 'button',
            className: 'ps-icon',
            title: t('toolbar.zoomOut'),
            'aria-label': t('toolbar.zoomOut'),
            onClick: () => setZoom(value => clamp(Math.round((value - 0.25) * 4) / 4, 0.5, 4)),
          }, Icons.minus()),
          h('button', {
            type: 'button',
            className: 'ps-zoom',
            title: t('toolbar.resetZoom'),
            'aria-label': t('toolbar.resetZoom'),
            onClick: () => setZoom(1),
          }, zoom === 1 ? t('toolbar.fit') : Math.round(zoom * 100) + '%'),
          h('button', {
            type: 'button',
            className: 'ps-icon',
            title: t('toolbar.zoomIn'),
            'aria-label': t('toolbar.zoomIn'),
            onClick: () => setZoom(value => clamp(Math.round((value + 0.25) * 4) / 4, 0.5, 4)),
          }, Icons.plus()),
          h('button', {
            type: 'button',
            className: 'ps-icon',
            title: t('toolbar.replace'),
            'aria-label': t('toolbar.replace'),
            disabled: opening,
            onClick: () => {
              const input = document.createElement('input')
              input.type = 'file'
              input.accept = 'application/pdf,.pdf'
              input.addEventListener('change', () => {
                const file = input.files?.[0]
                if (file !== undefined) void openFile(file)
              }, { once: true })
              input.click()
            },
          }, Icons.replace())),
        banner === null ? null : h('div', { className: 'ps-banner', role: 'alert' },
          h('span', { className: 'ps-banner-text' }, banner),
          openError === null ? null : h('button', {
            type: 'button',
            className: 'ps-icon',
            title: t('notice.dismiss'),
            'aria-label': t('notice.dismiss'),
            onClick: () => setOpenError(null),
          }, Icons.close())),
        notice === null ? null : h('div', { className: 'ps-notice', role: 'status' }, notice),
        h(PageSurface, {
          doc,
          page,
          zoom,
          busy,
          failed,
          attempt,
          selected: selection !== null,
          t,
          key: doc.id + ':' + page + ':' + attempt,
          onLoaded,
          onLoadFailed,
          onSelect,
          onClear: clearSelection,
          onRetry: () => {
            setAttempt(value => value + 1)
            setBusy(true)
            setFailed(null)
          },
        }),
        selection === null ? null : h(AskSheet, {
          t,
          crop,
          page,
          question,
          sending,
          error: sendError,
          onQuestion: setQuestion,
          onSend: send,
          onCancel: clearSelection,
          chips,
        }))
    }

    /** The guide glyph: a page with one region marked. */
    function GuideIcon() {
      return h('svg', {
        width: 16,
        height: 16,
        viewBox: '0 0 16 16',
        fill: 'none',
        'aria-hidden': true,
      },
      h('rect', { x: 2.5, y: 1.9, width: 11, height: 12.2, rx: 1.6, stroke: 'currentColor', strokeWidth: 1.3, opacity: .55 }),
      h('rect', { x: 4.6, y: 5.4, width: 6.8, height: 4.6, rx: 0.9, fill: 'currentColor', fillOpacity: .16, stroke: 'currentColor', strokeWidth: 1.3 }),
      h('path', { d: 'M4.6 12.2h3.4', stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round', opacity: .55 }))
    }

    /** The composer-dock entrance: one compact pill that opens the Sidebar page. */
    function DockButton(props) {
      const t = typeof props.t === 'function' ? props.t : key => key
      return h('button', {
        type: 'button',
        className: 'ps-dock',
        title: t('dock.hint'),
        onClick: () => {
          try {
            props.open()
          } catch (error) {
            console.warn('[dsh-pdf-study] cannot open the sidebar page:', error)
          }
        },
      }, Icons.book(), h('span', null, t('dock.label')))
    }

    /* ----------------------------------------------------------------- plugin */

    return {
      inject: ['slots', 'locale', 'sidebarRightTabs', 'sidebarRight', 'remote', 'remote.session'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)

        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-pdf-study: dictionaries')

        ctx.effect(() => {
          const element = document.createElement('style')
          element.dataset.dshPlugin = PLUGIN_ID
          element.textContent = STYLE
          document.head.appendChild(element)
          return () => {
            element.remove()
          }
        }, 'dsh-pdf-study: styles')

        ctx.effect(() => ctx.sidebarRightTabs.register({
          id: TAB_ID,
          kind: KIND,
          priority: 'builtin',
          keepMounted: true,
          title: () => t('tab.title'),
          guide: [{
            id: 'pdf-study',
            order: 20,
            title: () => t('guide.title'),
            description: () => t('guide.description'),
            icon: GuideIcon,
          }],
        }), 'dsh-pdf-study: tab type')

        ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({
          name: 'sidebar.right.pane.tab',
          key: TAB_ID,
          locale: NS,
          inject: sessionId => ({
            sessionId,
            ask: (request, signal) => ctx.remote.session.prompt(request, signal),
          }),
        }, PdfStudyView)), 'dsh-pdf-study: tab body')

        ctx.effect(() => {
          try {
            return ctx.slots.inject('conversation.composer.dock', () => ctx.slots.register({
              name: 'conversation.composer.dock',
              id: PLUGIN_ID,
              order: 60,
              locale: NS,
              inject: sessionId => ({
                open: () => ctx.sidebarRight.openTab(KIND),
                sessionId,
              }),
            }, DockButton))
          } catch (error) {
            console.warn('[dsh-pdf-study] composer dock is unavailable:', error)
            return () => {}
          }
        }, 'dsh-pdf-study: composer entrance')
      },
    }
  },
})
