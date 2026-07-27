/**
 * Chart type picker modal (main workarea) with Vega-Lite previews.
 */

import {
  VEGA_MARK_TYPES,
  VEGA_MARK_CATEGORIES,
  buildPreviewSpec,
  getChartTemplateMeta
} from './chart-templates.js'

/** @type {Promise<any>|null} */
let vegaEmbedReady = null

async function loadVegaEmbed () {
  if (!vegaEmbedReady) {
    vegaEmbedReady = import('vega-embed').then((m) => m.default || m)
  }
  return vegaEmbedReady
}

/**
 * Scale embedded Vega SVG to fill the preview card without clipping.
 * @param {HTMLElement} host
 */
function fitPreviewSvg (host) {
  const svg = host.querySelector('svg')
  if (!svg) return

  let w = parseFloat(svg.getAttribute('width') || '')
  let h = parseFloat(svg.getAttribute('height') || '')
  const vb = svg.getAttribute('viewBox')
  if (vb) {
    const parts = vb.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4) {
      w = parts[2]
      h = parts[3]
    }
  }
  if (!w || !h) {
    try {
      const box = svg.getBBox()
      w = box.width
      h = box.height
    } catch {
      return
    }
  }
  if (!w || !h) return

  svg.setAttribute('viewBox', `0 0 ${w} ${h}`)
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.style.width = '100%'
  svg.style.height = '100%'
  svg.style.display = 'block'
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet')

  const wrap = svg.parentElement
  if (wrap && wrap !== host) {
    wrap.style.width = '100%'
    wrap.style.height = '100%'
    wrap.style.display = 'flex'
    wrap.style.alignItems = 'center'
    wrap.style.justifyContent = 'center'
    wrap.style.overflow = 'hidden'
  }
}

/**
 * @param {HTMLElement} host
 * @param {object} baseSpec
 */
async function renderPreview (host, baseSpec) {
  if (host.dataset.rendered === '1') return

  const paint = async () => {
    const w = Math.max(96, Math.round(host.clientWidth || 148))
    const h = Math.max(72, Math.round(host.clientHeight || 104))
    const spec = {
      ...baseSpec,
      width: w,
      height: h,
      autosize: { type: 'fit', contains: 'padding' }
    }
    host.replaceChildren()
    const embed = await loadVegaEmbed()
    await embed(host, spec, {
      actions: false,
      renderer: 'svg',
      tooltip: false,
      defaultStyle: false
    })
    fitPreviewSvg(host)
  }

  try {
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await paint()
    host.dataset.rendered = '1'

    if (typeof ResizeObserver !== 'undefined') {
      let timer = 0
      const ro = new ResizeObserver(() => {
        clearTimeout(timer)
        timer = window.setTimeout(() => {
          fitPreviewSvg(host)
        }, 80)
      })
      ro.observe(host)
      host._previewRo = ro
    }
  } catch {
    host.replaceChildren()
    const fallback = document.createElement('span')
    fallback.className = 'ai_chart_preview_fallback'
    fallback.textContent = 'Preview'
    host.appendChild(fallback)
  }
}

/**
 * @param {object} opts
 * @param {(templateId:string, meta:object)=>void} opts.onCreate
 * @param {() => void} [opts.onClose]
 * @param {Array<{columns:string[],rows:object[]}>} [opts.csvFiles]
 * @param {object} [opts.labels]
 */
export function openChartPickerModal (opts) {
  const {
    onCreate,
    onClose,
    labels = {}
  } = opts

  const existing = document.getElementById('ai_chart_picker_modal')
  if (existing) existing.remove()

  const overlay = document.createElement('div')
  overlay.id = 'ai_chart_picker_modal'
  overlay.className = 'ai_chart_picker_overlay'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.setAttribute('aria-label', labels.title || 'Choose chart type')

  const title = labels.title || 'Choose a chart type'
  const subtitle = labels.subtitle || 'Click a preview to select, then add it to the canvas. Attach CSV in chat to use your data.'
  const createLabel = labels.create || 'Add to canvas'
  const cancelLabel = labels.cancel || 'Cancel'
  const searchPh = labels.search || 'Search chart types…'

  const sections = VEGA_MARK_CATEGORIES.map((cat) => {
    const items = VEGA_MARK_TYPES.filter((m) => m.category === cat)
    const cards = items.map((m) => `
      <button type="button" class="ai_chart_pick_card" data-id="${m.id}" title="${m.description}">
        <div class="ai_chart_pick_preview" data-preview-id="${m.id}"></div>
        <span class="ai_chart_pick_label">${m.label}</span>
      </button>
    `).join('')
    return `<section class="ai_chart_pick_section"><h3>${cat}</h3><div class="ai_chart_pick_grid">${cards}</div></section>`
  }).join('')

  overlay.innerHTML = `
    <div class="ai_chart_picker_panel">
      <header class="ai_chart_picker_header">
        <div>
          <strong>${title}</strong>
          <p>${subtitle}</p>
        </div>
        <button type="button" class="ai_chart_picker_close" aria-label="${cancelLabel}">×</button>
      </header>
      <div class="ai_chart_picker_search_row">
        <input type="search" id="ai_chart_picker_search" placeholder="${searchPh}" autocomplete="off" />
      </div>
      <div class="ai_chart_picker_body" id="ai_chart_picker_body">${sections}</div>
      <footer class="ai_chart_picker_footer">
        <span id="ai_chart_picker_sel_hint" class="ai_chart_picker_sel_hint">${labels.selectHint || 'Select a chart type'}</span>
        <div class="ai_chart_picker_actions">
          <button type="button" class="ai_btn secondary ai_chart_picker_cancel">${cancelLabel}</button>
          <button type="button" class="ai_btn primary ai_chart_picker_create" disabled>${createLabel}</button>
        </div>
      </footer>
    </div>
  `

  const workarea = document.getElementById('workarea')
  document.body.appendChild(overlay)

  const positionOverlay = () => {
    const wa = document.getElementById('workarea')
    if (!wa) return
    const r = wa.getBoundingClientRect()
    overlay.style.position = 'fixed'
    overlay.style.top = `${Math.max(0, r.top)}px`
    overlay.style.left = `${Math.max(0, r.left)}px`
    overlay.style.width = `${Math.max(0, r.width)}px`
    overlay.style.height = `${Math.max(0, r.height)}px`
    overlay.style.right = 'auto'
    overlay.style.bottom = 'auto'
  }

  positionOverlay()
  const onReposition = () => positionOverlay()
  window.addEventListener('resize', onReposition)
  workarea?.addEventListener('scroll', onReposition, { passive: true })

  let selectedId = null
  const cards = [...overlay.querySelectorAll('.ai_chart_pick_card')]
  const createBtn = overlay.querySelector('.ai_chart_picker_create')
  const hintEl = overlay.querySelector('#ai_chart_picker_sel_hint')
  const searchInput = overlay.querySelector('#ai_chart_picker_search')

  const close = () => {
    window.removeEventListener('resize', onReposition)
    workarea?.removeEventListener('scroll', onReposition)
    overlay.remove()
    onClose?.()
  }

  const selectCard = (id) => {
    selectedId = id
    cards.forEach((c) => c.classList.toggle('selected', c.dataset.id === id))
    const meta = getChartTemplateMeta(id)
    if (hintEl && meta) hintEl.textContent = meta.description
    if (createBtn) createBtn.disabled = !id
  }

  cards.forEach((card) => {
    card.addEventListener('click', () => selectCard(card.dataset.id))
  })

  searchInput?.addEventListener('input', () => {
    const q = String(searchInput.value || '').trim().toLowerCase()
    cards.forEach((card) => {
      const meta = getChartTemplateMeta(card.dataset.id)
      const hay = `${meta?.label} ${meta?.category} ${meta?.description}`.toLowerCase()
      card.style.display = !q || hay.includes(q) ? '' : 'none'
    })
    overlay.querySelectorAll('.ai_chart_pick_section').forEach((sec) => {
      const any = [...sec.querySelectorAll('.ai_chart_pick_card')].some((c) => c.style.display !== 'none')
      sec.style.display = any ? '' : 'none'
    })
  })

  overlay.querySelector('.ai_chart_picker_close')?.addEventListener('click', close)
  overlay.querySelector('.ai_chart_picker_cancel')?.addEventListener('click', close)
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close()
  })

  createBtn?.addEventListener('click', () => {
    if (!selectedId) return
    const meta = getChartTemplateMeta(selectedId)
    onCreate(selectedId, meta)
    close()
  })

  document.addEventListener('keydown', function onKey (e) {
    if (e.key === 'Escape') {
      document.removeEventListener('keydown', onKey)
      close()
    }
  })

  // Lazy-render previews in batches
  const previewHosts = [...overlay.querySelectorAll('.ai_chart_pick_preview')]
  let idx = 0
  const batch = () => {
    const slice = previewHosts.slice(idx, idx + 8)
    idx += 8
    slice.forEach((host) => {
      const id = host.getAttribute('data-preview-id')
      if (id) renderPreview(host, buildPreviewSpec(id))
    })
    if (idx < previewHosts.length) requestAnimationFrame(batch)
  }
  requestAnimationFrame(batch)

  return { close, selectCard }
}
