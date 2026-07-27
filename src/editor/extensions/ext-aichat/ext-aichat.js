/**
 * @file ext-aichat.js — Left AI chat panel (Gemini) that draws SVG onto the canvas.
 * @license MIT
 */

import {
  GEMINI_MODELS,
  GEMINI_IMAGE_MODELS,
  DEFAULT_COMPARE_MODELS,
  DEFAULT_MODEL,
  DEFAULT_IMAGE_MODEL,
  resolveActiveModel,
  resolveImageModel,
  generateGeminiText,
  generateGeminiTextWithMeta,
  generateGeminiImage,
  extractSvgFromText,
  diagnoseReplyForSvg,
  compareGeminiModels,
  listGeminiModels
} from './gemini.js'
import { applySvgToCanvas, buildSystemPrompt, conversationalTextFromReply, compactModelHistory, formatApplyFailureDetails, formatUserFacingSvgError, looksLikeTruncatedSvg, buildContinuityNote, looksLikeEditIntent, looksLikeGenerativeIntent, buildGenerativeIntentContext, summarizeSelectionSvg } from './apply-svg.js'
import {
  applySvgToCanvasAnimated,
  replaceSelectionWithSvg,
  serializeSelection
} from './reveal-svg.js'
import { placeImageOnCanvas, buildRasterPrompt } from './place-image.js'
import {
  resolveToolPlan,
  placeToolsOnCanvas,
  parseToolsBlockFromReply,
  normalizeToolSpecs,
  formatBrushPlacementNote,
  activateEditorTool
} from './place-tools.js'
import { runMaxMode, formatPlanForChat } from './max-mode.js'
import {
  blobToGeminiImage,
  imageFilesFromDataTransfer,
  buildUserParts,
  MAX_IMAGES
} from './image-attach.js'
import {
  parseCsvFile,
  formatCsvForPrompt,
  csvFilesFromDataTransfer,
  MAX_CSV_FILES
} from './csv-attach.js'
import { applyPlotFromReply, extractPlotSpecFromText } from './apply-plot.js'

const name = 'aichat'
const LS_KEY = 'svgedit.gemini.apiKey'
const LS_MODEL = 'svgedit.gemini.model'
const LS_IMAGE_MODEL = 'svgedit.gemini.imageModel'
const LS_TASK = 'svgedit.aichat.task'
const LS_OPEN = 'svgedit.aichat.open'
const LS_COMPARE = 'svgedit.aichat.compare'
const LS_COMPARE_MODELS = 'svgedit.aichat.compareModels'
const LS_USE_BRUSHES = 'svgedit.aichat.useBrushes'
const LS_USE_PLOTS = 'svgedit.aichat.usePlots'
const LS_PLOT_ENGINE = 'svgedit.aichat.plotEngine'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    console.warn(`Missing translation (${lang}) for ${name} - using 'en'`)
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

const t = (svgEditor, key) => svgEditor.i18next.t(`${name}:${key}`)

export default {
  name,
  async init () {
    const svgEditor = this
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id, $click } = svgCanvas

    /** @type {Array<{role:'user'|'model', text:string, images?: Array<{mimeType:string,data:string}>}>} */
    let history = []
    let busy = false
    /** @type {Map<string, string>} modelId -> last SVG from compare */
    const compareSvgCache = new Map()
    /** @type {Array<{id:string, mimeType:string, data:string, previewUrl:string, name:string}>} */
    let pendingImages = []
    /** @type {Array<{id:string,name:string,columns:string[],rows:object[],rowCount:number}>} */
    let pendingCsv = []
    let imageIdSeq = 0
    /** @type {AbortController|null} */
    let activeAbort = null
    /** @type {Array<{id:string, at:number, prompt:string, mode:string, svg?:string, note:string}>} */
    let actionHistory = []
    /** @type {Element[]} */
    let tipElems = []
    let tipRaf = 0

    const STEPS = [
      'Understanding request',
      'Planning drawing',
      'Generating SVG',
      'Drawing on canvas',
      'Done'
    ]

    const setSteps = (activeIndex, detail = '') => {
      const box = $id('ai_steps')
      if (!box) return
      box.style.display = 'block'
      box.innerHTML = STEPS.map((label, i) => {
        let cls = 'ai-step'
        if (i < activeIndex) cls += ' done'
        if (i === activeIndex) cls += ' active'
        const extra = i === activeIndex && detail ? ` — ${detail}` : ''
        return `<div class="${cls}"><span class="ai-step-dot"></span>${label}${extra}</div>`
      }).join('')
    }

    const hideSteps = () => {
      const box = $id('ai_steps')
      if (box) {
        box.style.display = 'none'
        box.innerHTML = ''
      }
    }

    const setBusyUi = (on) => {
      busy = on
      const sendBtn = $id('ai_chat_send')
      const stopBtn = $id('ai_chat_stop')
      if (sendBtn) sendBtn.disabled = on
      if (stopBtn) stopBtn.style.display = on ? 'inline-block' : 'none'
    }

    const ensureAskTip = () => {
      let tip = $id('ai_ask_edit_tip')
      if (tip) return tip
      tip = document.createElement('button')
      tip.type = 'button'
      tip.id = 'ai_ask_edit_tip'
      tip.className = 'ai-ask-edit-tip'
      tip.hidden = true
      tip.textContent = t(svgEditor, 'askAiEdit')
      tip.title = t(svgEditor, 'askAiEditTitle')
      tip.addEventListener('mousedown', (e) => {
        // Keep selection; don't let canvas steal the click
        e.preventDefault()
        e.stopPropagation()
      })
      tip.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        openAskAiEdit()
      })
      document.body.appendChild(tip)

      const onLayout = () => scheduleAskTipReposition()
      window.addEventListener('resize', onLayout, { passive: true })
      window.addEventListener('scroll', onLayout, { passive: true, capture: true })
      const workarea = $id('workarea')
      workarea?.addEventListener('scroll', onLayout, { passive: true })
      const root = document.querySelector('.svg_editor')
      if (root && typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(onLayout)
        ro.observe(root)
        if (workarea) ro.observe(workarea)
      }
      return tip
    }

    const hideAskTip = () => {
      const tip = $id('ai_ask_edit_tip')
      if (tip) tip.hidden = true
      tipElems = []
    }

    const selectionScreenRect = (elems) => {
      let minL = Infinity
      let minT = Infinity
      let maxR = -Infinity
      let maxB = -Infinity
      let any = false
      for (const el of (elems || []).filter(Boolean)) {
        try {
          const r = el.getBoundingClientRect?.()
          if (!r || (!r.width && !r.height)) continue
          any = true
          minL = Math.min(minL, r.left)
          minT = Math.min(minT, r.top)
          maxR = Math.max(maxR, r.right)
          maxB = Math.max(maxB, r.bottom)
        } catch (_) { /* ignore */ }
      }
      if (!any) return null
      return { left: minL, top: minT, right: maxR, bottom: maxB, width: maxR - minL, height: maxB - minT }
    }

    const repositionAskTip = () => {
      const tip = ensureAskTip()
      if (!tip) return
      const elems = tipElems.length
        ? tipElems
        : (svgCanvas.getSelectedElements?.() || []).filter(Boolean)
      if (!elems.length) {
        tip.hidden = true
        return
      }
      const screen = selectionScreenRect(elems)
      if (!screen) {
        tip.hidden = true
        return
      }
      tip.hidden = false
      tip.style.left = `${Math.round(screen.left + screen.width / 2)}px`
      tip.style.top = `${Math.max(4, Math.round(screen.top - 8))}px`
    }

    const scheduleAskTipReposition = () => {
      if (tipRaf) cancelAnimationFrame(tipRaf)
      tipRaf = requestAnimationFrame(() => {
        tipRaf = 0
        repositionAskTip()
      })
    }

    const updateAskTip = (elems) => {
      tipElems = (elems || []).filter(Boolean)
      if (!tipElems.length) {
        hideAskTip()
        return
      }
      // Skip while drawing tools are active if no real selection chrome needed
      scheduleAskTipReposition()
    }

    const openAskAiEdit = () => {
      const editCb = $id('ai_edit_selection')
      if (editCb) editCb.checked = true
      const task = $id('ai_task_mode')
      if (task && task.value !== 'draw') {
        task.value = 'draw'
        syncTaskModeUi()
      }
      setOpen(true)
      const input = $id('ai_chat_input')
      if (input) {
        if (!input.value.trim()) {
          input.placeholder = t(svgEditor, 'placeholderEditSelection')
        }
        input.focus()
      }
      setStatus(t(svgEditor, 'askAiEditReady'))
      scheduleAskTipReposition()
    }

    const stopGeneration = () => {
      activeAbort?.abort()
      activeAbort = null
      setBusyUi(false)
      hideSteps()
      setStatus(t(svgEditor, 'stopped'))
    }

    const pushActionHistory = (entry) => {
      actionHistory.unshift({
        id: `hist_${Date.now()}`,
        at: Date.now(),
        ...entry
      })
      actionHistory = actionHistory.slice(0, 40)
      renderActionHistory()
    }

    const renderActionHistory = () => {
      const list = $id('ai_history_list')
      if (!list) return
      if (!actionHistory.length) {
        list.innerHTML = `<p class="ai_hint">${t(svgEditor, 'historyEmpty')}</p>`
        return
      }
      list.innerHTML = actionHistory.map((h) => {
        const time = new Date(h.at).toLocaleTimeString()
        return `<div class="ai-history-item" data-id="${h.id}">
          <div class="ai-history-meta">${time} · ${h.mode}</div>
          <div class="ai-history-prompt">${(h.prompt || '').slice(0, 120)}</div>
          <div class="ai-history-note">${h.note || ''}</div>
          ${h.svg ? `<button type="button" class="ai_btn secondary ai-history-reapply" data-id="${h.id}">${t(svgEditor, 'historyReapply')}</button>` : ''}
        </div>`
      }).join('')
      list.querySelectorAll('.ai-history-reapply').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const item = actionHistory.find((x) => x.id === btn.getAttribute('data-id'))
          if (!item?.svg) return
          setSteps(3, 'Replaying…')
          try {
            await applySvgToCanvasAnimated(svgEditor, item.svg, item.mode === 'replace' ? 'replace' : 'append', {
              onProgress: (p) => setSteps(3, p.label)
            })
            setSteps(4)
            setStatus(t(svgEditor, 'appliedAppend'))
          } catch (err) {
            setStatus(err?.message || String(err), true)
          } finally {
            setTimeout(hideSteps, 800)
          }
        })
      })
    }

    const getApiKey = () => localStorage.getItem(LS_KEY) || ''
    const getModel = () => resolveActiveModel(localStorage.getItem(LS_MODEL) || DEFAULT_MODEL)
    const getImageModel = () => resolveImageModel(localStorage.getItem(LS_IMAGE_MODEL) || DEFAULT_IMAGE_MODEL)
    const getTaskMode = () => {
      const v = localStorage.getItem(LS_TASK) || 'draw'
      return (v === 'image' || v === 'icon' || v === 'max') ? v : 'draw'
    }
    const getCompareOn = () => localStorage.getItem(LS_COMPARE) === '1'
    const getUseBrushes = () => localStorage.getItem(LS_USE_BRUSHES) === '1'
    const getUsePlots = () => localStorage.getItem(LS_USE_PLOTS) === '1'
    const getPlotEngine = () => {
      const v = localStorage.getItem(LS_PLOT_ENGINE) || 'vega'
      return v === 'echarts' ? 'echarts' : 'vega'
    }

    const fillModelSelect = (sel, models, selectedId) => {
      if (!sel) return
      sel.innerHTML = ''
      models.forEach((m) => {
        const opt = document.createElement('option')
        opt.value = m.id
        opt.textContent = `${m.label}${m.powerful ? ' ★' : ''}`
        sel.appendChild(opt)
      })
      if ([...sel.options].some((o) => o.value === selectedId)) sel.value = selectedId
      else if (models[0]) sel.value = models[0].id
    }

    const syncTaskModeUi = () => {
      const task = $id('ai_task_mode')?.value || 'draw'
      localStorage.setItem(LS_TASK, task)
      const isRaster = task === 'image' || task === 'icon'
      const isMax = task === 'max'
      const modelSel = $id('ai_model')
      const maxImgWrap = $id('ai_max_image_wrap')
      if (isRaster) {
        fillModelSelect(modelSel, GEMINI_IMAGE_MODELS, getImageModel())
        localStorage.setItem(LS_IMAGE_MODEL, modelSel?.value || DEFAULT_IMAGE_MODEL)
      } else {
        fillModelSelect(modelSel, GEMINI_MODELS, getModel())
        localStorage.setItem(LS_MODEL, modelSel?.value || DEFAULT_MODEL)
      }
      if (maxImgWrap) {
        maxImgWrap.style.display = isMax ? 'block' : 'none'
        if (isMax) {
          fillModelSelect($id('ai_max_image_model'), GEMINI_IMAGE_MODELS, getImageModel())
        }
      }
      const modelLabel = $id('ai_model_label')
      if (modelLabel) {
        modelLabel.textContent = isMax
          ? t(svgEditor, 'modelLabelPlan')
          : t(svgEditor, 'modelLabel')
      }
      const compareWrap = $id('ai_compare_wrap')
      const drawOpts = $id('ai_draw_options')
      if (compareWrap) compareWrap.style.display = (isRaster || isMax) ? 'none' : ''
      if (drawOpts) drawOpts.style.display = isRaster ? 'none' : ''
      if ((isRaster || isMax) && $id('ai_compare_on')) {
        $id('ai_compare_on').checked = false
        syncCompareUi()
      }
      const input = $id('ai_chat_input')
      if (input) {
        input.placeholder = task === 'icon'
          ? t(svgEditor, 'placeholderIcon')
          : task === 'image'
            ? t(svgEditor, 'placeholderImage')
            : task === 'max'
              ? t(svgEditor, 'placeholderMax')
              : t(svgEditor, 'placeholder')
      }
      const hint = $id('ai_task_hint')
      if (hint) {
        hint.textContent = task === 'icon'
          ? t(svgEditor, 'taskHintIcon')
          : task === 'image'
            ? t(svgEditor, 'taskHintImage')
            : task === 'max'
              ? t(svgEditor, 'taskHintMax')
              : t(svgEditor, 'taskHint')
      }
    }
    const getCompareModels = () => {
      try {
        const raw = JSON.parse(localStorage.getItem(LS_COMPARE_MODELS) || 'null')
        if (Array.isArray(raw) && raw.length) {
          return raw.map(resolveActiveModel).filter((id, i, arr) => arr.indexOf(id) === i)
        }
      } catch (_) { /* ignore */ }
      return [...DEFAULT_COMPARE_MODELS]
    }

    const setOpen = (open) => {
      const root = document.querySelector('.svg_editor')
      const panel = $id('ai_chat_panel')
      if (!root || !panel) return
      root.classList.toggle('ai-chat-open', open)
      panel.classList.toggle('open', open)
      panel.setAttribute('aria-hidden', open ? 'false' : 'true')
      localStorage.setItem(LS_OPEN, open ? '1' : '0')
      const btn = $id('tool_aichat')
      if (btn) btn.pressed = open
      svgEditor.updateCanvas?.(false)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => scheduleAskTipReposition())
      })
      if (open) $id('ai_chat_input')?.focus()
    }

    const syncCompareUi = () => {
      const on = !!$id('ai_compare_on')?.checked
      const box = $id('ai_compare_models')
      const single = $id('ai_model_wrap')
      if (box) box.style.display = on ? 'block' : 'none'
      if (single) single.style.display = on ? 'none' : 'block'
      document.querySelector('.svg_editor')?.classList.toggle('ai-chat-compare', on)
      localStorage.setItem(LS_COMPARE, on ? '1' : '0')
    }

    const selectedCompareModels = () => {
      const checks = $id('ai_compare_models')?.querySelectorAll('input[type=checkbox][data-model]:checked')
      if (!checks?.length) return []
      return [...checks].map((c) => c.getAttribute('data-model'))
    }

    const persistCompareModels = () => {
      localStorage.setItem(LS_COMPARE_MODELS, JSON.stringify(selectedCompareModels()))
    }

    const appendMsg = (role, text, images = []) => {
      const log = $id('ai_chat_log')
      if (!log) return
      const row = document.createElement('div')
      row.className = `ai-msg ai-msg-${role}`
      if (images?.length) {
        const strip = document.createElement('div')
        strip.className = 'ai-msg-images'
        images.forEach((img) => {
          const el = document.createElement('img')
          el.src = img.previewUrl || `data:${img.mimeType};base64,${img.data}`
          el.alt = img.name || 'attachment'
          strip.appendChild(el)
        })
        row.appendChild(strip)
      }
      if (text) {
        const body = document.createElement('div')
        body.className = 'ai-msg-text'
        body.textContent = text
        row.appendChild(body)
      }
      log.appendChild(row)
      log.scrollTop = log.scrollHeight
      return row
    }

    const attachFailureDetails = (rowOrNull, message, details) => {
      const log = $id('ai_chat_log')
      const row = rowOrNull || (() => {
        if (!log) return null
        const r = document.createElement('div')
        r.className = 'ai-msg ai-msg-model ai-msg-error'
        log.appendChild(r)
        return r
      })()
      if (!row) return

      const summary = document.createElement('div')
      summary.className = 'ai-msg-error-summary'
      summary.textContent = message || t(svgEditor, 'emptySvg')
      row.appendChild(summary)

      const detailsText = formatApplyFailureDetails(details, message)
      const toggle = document.createElement('button')
      toggle.type = 'button'
      toggle.className = 'ai-details-toggle'
      toggle.textContent = t(svgEditor, 'moreDetails')
      const pre = document.createElement('pre')
      pre.className = 'ai-failure-details'
      pre.hidden = true
      pre.textContent = detailsText
      toggle.addEventListener('click', () => {
        const open = pre.hidden
        pre.hidden = !open
        toggle.textContent = open
          ? t(svgEditor, 'hideDetails')
          : t(svgEditor, 'moreDetails')
        if (log) log.scrollTop = log.scrollHeight
      })
      row.appendChild(toggle)
      row.appendChild(pre)
      if (log) log.scrollTop = log.scrollHeight
    }

    const showApplyFailure = (message, details, opts = {}) => {
      const msg = message || t(svgEditor, 'emptySvg')
      setStatus(msg, true)
      if (opts.row) {
        attachFailureDetails(opts.row, msg, details)
      } else {
        attachFailureDetails(null, msg, details)
      }
    }

    const renderAttachStrip = () => {
      const strip = $id('ai_attach_strip')
      if (!strip) return
      strip.innerHTML = ''
      const hasAny = pendingImages.length || pendingCsv.length
      strip.style.display = hasAny ? 'flex' : 'none'
      pendingImages.forEach((img) => {
        const chip = document.createElement('div')
        chip.className = 'ai-attach-chip'
        const thumb = document.createElement('img')
        thumb.src = img.previewUrl
        thumb.alt = img.name
        const rm = document.createElement('button')
        rm.type = 'button'
        rm.className = 'ai-attach-remove'
        rm.title = t(svgEditor, 'removeImage')
        rm.textContent = '×'
        rm.addEventListener('click', () => {
          pendingImages = pendingImages.filter((p) => p.id !== img.id)
          renderAttachStrip()
        })
        chip.appendChild(thumb)
        chip.appendChild(rm)
        strip.appendChild(chip)
      })
      pendingCsv.forEach((csv) => {
        const chip = document.createElement('div')
        chip.className = 'ai-attach-chip ai-attach-chip-csv'
        chip.title = `${csv.name} (${csv.rowCount} rows)`
        const label = document.createElement('span')
        label.textContent = `${csv.name}\n${csv.rowCount} rows`
        const rm = document.createElement('button')
        rm.type = 'button'
        rm.className = 'ai-attach-remove'
        rm.title = t(svgEditor, 'removeImage')
        rm.textContent = '×'
        rm.addEventListener('click', () => {
          pendingCsv = pendingCsv.filter((p) => p.id !== csv.id)
          renderAttachStrip()
        })
        chip.appendChild(label)
        chip.appendChild(rm)
        strip.appendChild(chip)
      })
    }

    const renderPendingImages = () => renderAttachStrip()

    const addImageFiles = async (files) => {
      const list = [...files].filter((f) => f?.type?.startsWith('image/'))
      if (!list.length) return
      const room = MAX_IMAGES - pendingImages.length
      if (room <= 0) {
        setStatus(t(svgEditor, 'tooManyImages').replace('{{n}}', String(MAX_IMAGES)), true)
        return
      }
      const slice = list.slice(0, room)
      try {
        for (const file of slice) {
          const img = await blobToGeminiImage(file, file.name || 'paste.png')
          pendingImages.push({
            id: `img_${++imageIdSeq}`,
            mimeType: img.mimeType,
            data: img.data,
            previewUrl: img.previewUrl,
            name: img.name
          })
        }
        if (list.length > room) {
          setStatus(t(svgEditor, 'tooManyImages').replace('{{n}}', String(MAX_IMAGES)), true)
        } else {
          setStatus(t(svgEditor, 'imagesAttached').replace('{{n}}', String(pendingImages.length)))
        }
        renderPendingImages()
      } catch (err) {
        setStatus(err?.message || String(err), true)
      }
    }

    const addCsvFiles = async (files) => {
      if (!getUsePlots()) {
        setStatus(t(svgEditor, 'usePlotsHint'), true)
        return
      }
      const list = [...files].filter((f) => {
        const name = String(f?.name || '').toLowerCase()
        return f?.type === 'text/csv' || f?.type === 'application/vnd.ms-excel' || name.endsWith('.csv')
      })
      if (!list.length) return
      const room = MAX_CSV_FILES - pendingCsv.length
      if (room <= 0) {
        setStatus(t(svgEditor, 'csvTooMany').replace('{{n}}', String(MAX_CSV_FILES)), true)
        return
      }
      const slice = list.slice(0, room)
      try {
        for (const file of slice) {
          const parsed = await parseCsvFile(file)
          pendingCsv.push(parsed)
        }
        if (list.length > room) {
          setStatus(t(svgEditor, 'csvTooMany').replace('{{n}}', String(MAX_CSV_FILES)), true)
        } else {
          const last = pendingCsv[pendingCsv.length - 1]
          setStatus(t(svgEditor, 'csvAttached')
            .replace('{{name}}', last.name)
            .replace('{{n}}', String(last.rowCount)))
        }
        renderAttachStrip()
      } catch (err) {
        setStatus(err?.message || String(err), true)
      }
    }

    const clearPendingCsv = () => {
      pendingCsv = []
      renderAttachStrip()
    }

    const clearPendingAttachments = () => {
      pendingImages = []
      pendingCsv = []
      renderAttachStrip()
    }

    const syncPlotUi = () => {
      const on = !!$id('ai_use_plots')?.checked
      const wrap = $id('ai_plot_engine_wrap')
      const csvBtn = $id('ai_chat_attach_csv')
      const hint = $id('ai_attach_hint')
      if (wrap) wrap.style.display = on ? 'block' : 'none'
      if (csvBtn) csvBtn.style.display = on ? '' : 'none'
      if (hint) {
        hint.textContent = on
          ? t(svgEditor, 'attachHintPlots')
          : t(svgEditor, 'attachHint')
      }
      if (!on && pendingCsv.length) clearPendingCsv()
    }

    const setStatus = (msg, isError = false) => {
      const el = $id('ai_chat_status')
      if (!el) return
      el.textContent = msg || ''
      el.classList.toggle('error', !!isError)
    }

    const applyOne = async (svg, mode, opts = {}) => {
      const editSelection = !!opts.editSelection
      const signal = opts.signal
      const result = editSelection
        ? await replaceSelectionWithSvg(svgEditor, svg, {
          signal,
          onProgress: (p) => setSteps(3, p.label)
        })
        : await applySvgToCanvasAnimated(svgEditor, svg, mode, {
          signal,
          onProgress: (p) => setSteps(3, p.label)
        })
      if (!result.ok) {
        // Fallback to instant apply if progressive parse failed
        const fallback = applySvgToCanvas(svgEditor, svg, mode)
        if (!fallback.ok) {
          const message = fallback.message || result.message || t(svgEditor, 'emptySvg')
          const details = {
            stage: 'apply',
            ...(result.details || {}),
            ...(fallback.details || {}),
            animatedMessage: result.message,
            fallbackMessage: fallback.message
          }
          setStatus(message, true)
          return { ok: false, message, details }
        }
      }
      setStatus(editSelection
        ? t(svgEditor, 'appliedSelection')
        : (mode === 'replace'
          ? t(svgEditor, 'appliedReplace')
          : t(svgEditor, 'appliedAppend')))
      return { ok: true }
    }

    const renderCompareResults = (results, mode) => {
      const log = $id('ai_chat_log')
      if (!log) return
      compareSvgCache.clear()

      const wrap = document.createElement('div')
      wrap.className = 'ai-compare-results'
      results.forEach((r) => {
        const card = document.createElement('div')
        card.className = `ai-compare-card ${r.ok ? 'ok' : 'fail'}`
        const head = document.createElement('div')
        head.className = 'ai-compare-head'
        head.innerHTML = `<strong>${r.label}</strong><span>${r.ms}ms</span>`
        card.appendChild(head)

        const body = document.createElement('div')
        body.className = 'ai-compare-body'
        if (!r.ok) {
          body.textContent = r.error || 'Failed'
        } else if (!r.svg) {
          body.textContent = (r.text || '').slice(0, 400) || t(svgEditor, 'emptySvg')
        } else {
          compareSvgCache.set(r.model, r.svg)
          body.textContent = t(svgEditor, 'compareReady')
          const actions = document.createElement('div')
          actions.className = 'ai-compare-actions'
          const applyBtn = document.createElement('button')
          applyBtn.type = 'button'
          applyBtn.className = 'ai_btn primary'
          applyBtn.textContent = t(svgEditor, 'applyToCanvas')
          applyBtn.addEventListener('click', async () => {
            const svg = compareSvgCache.get(r.model)
            if (!svg) return
            setBusyUi(true)
            setSteps(3)
            try {
              const applied = await applyOne(svg, mode)
              if (applied.ok) {
                pushActionHistory({
                  prompt: 'Compare apply',
                  mode,
                  svg,
                  note: `Applied ${r.label}`
                })
                setSteps(4)
              } else {
                showApplyFailure(applied.message, applied.details)
              }
            } finally {
              setBusyUi(false)
              setTimeout(hideSteps, 800)
            }
          })
          actions.appendChild(applyBtn)
          card.appendChild(actions)
        }
        card.appendChild(body)
        wrap.appendChild(card)
      })
      log.appendChild(wrap)
      log.scrollTop = log.scrollHeight
    }

    const buildContentsForPrompt = (compareMode, currentParts) => {
      if (compareMode) {
        return [{ role: 'user', parts: currentParts }]
      }
      // Keep a longer window for continuity; SVG bodies are already compacted
      const recent = history.slice(-24)
      const contents = recent.map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: m.parts || [{ text: m.text }]
      }))
      // current turn already pushed into history below — avoid duplicating
      return contents
    }

    const send = async () => {
      if (busy) return
      const input = $id('ai_chat_input')
      const prompt = (input?.value || '').trim()
      const apiKey = ($id('ai_api_key')?.value || getApiKey()).trim()
      const taskMode = $id('ai_task_mode')?.value || getTaskMode()
      const isRaster = taskMode === 'image' || taskMode === 'icon'
      const isMax = taskMode === 'max'
      const model = isRaster
        ? resolveImageModel($id('ai_model')?.value || getImageModel())
        : resolveActiveModel($id('ai_model')?.value || getModel())
      const imageModel = resolveImageModel(
        $id('ai_max_image_model')?.value || $id('ai_model')?.value || getImageModel()
      )
      const mode = $id('ai_draw_mode')?.value || 'append'
      const includeCanvas = !!$id('ai_include_canvas')?.checked
      const compareOn = !isRaster && !isMax && !!$id('ai_compare_on')?.checked
      let editSelection = !isRaster && !isMax && !!$id('ai_edit_selection')?.checked
      const liveSelectionSvg = (!isRaster && !isMax) ? serializeSelection(svgCanvas) : ''
      // Auto-enable selection edit for short follow-ups when something is selected
      if (!editSelection && liveSelectionSvg && looksLikeEditIntent(prompt)) {
        editSelection = true
        const editCb = $id('ai_edit_selection')
        if (editCb) editCb.checked = true
      }
      const selectionSvg = editSelection ? liveSelectionSvg : ''
      const selectionSummary = (!editSelection && liveSelectionSvg)
        ? summarizeSelectionSvg(liveSelectionSvg)
        : ''
      const imagesSnapshot = pendingImages.map((p) => ({
        mimeType: p.mimeType,
        data: p.data,
        previewUrl: p.previewUrl,
        name: p.name
      }))
      const csvSnapshot = pendingCsv.map((c) => ({
        id: c.id,
        name: c.name,
        columns: c.columns,
        rows: c.rows,
        rowCount: c.rowCount
      }))
      const usePlots = getUsePlots()
      const plotEngine = ($id('ai_plot_engine')?.value || getPlotEngine()) === 'echarts' ? 'echarts' : 'vega'

      if (!apiKey) {
        setStatus(t(svgEditor, 'needKey'), true)
        $id('ai_api_key')?.focus()
        return
      }
      if (!prompt && !imagesSnapshot.length && !csvSnapshot.length) return
      if (editSelection && !selectionSvg) {
        setStatus(t(svgEditor, 'needSelection'), true)
        return
      }

      localStorage.setItem(LS_KEY, apiKey)
      localStorage.setItem(LS_TASK, taskMode)
      if (isRaster) localStorage.setItem(LS_IMAGE_MODEL, model)
      else localStorage.setItem(LS_MODEL, model)
      if (isMax) localStorage.setItem(LS_IMAGE_MODEL, imageModel)
      persistCompareModels()

      const compareIds = compareOn ? selectedCompareModels() : []
      if (compareOn && compareIds.length < 1) {
        setStatus(t(svgEditor, 'needCompareModels'), true)
        return
      }

      activeAbort?.abort()
      activeAbort = new AbortController()
      const { signal } = activeAbort
      setBusyUi(true)
      input.value = ''
      const generative = imagesSnapshot.length > 0 || (csvSnapshot.length > 0 && usePlots) || looksLikeGenerativeIntent(prompt, {
        taskMode,
        editSelection,
        hasSelection: !!liveSelectionSvg,
        hasImages: imagesSnapshot.length > 0,
        hasCsv: csvSnapshot.length > 0,
        usePlots,
        ...buildGenerativeIntentContext(history, actionHistory)
      })
      const promptWithCsv = (prompt || '') + (csvSnapshot.length && usePlots ? formatCsvForPrompt(csvSnapshot) : '')
      const userParts = buildUserParts(
        isRaster && generative
          ? buildRasterPrompt(prompt, taskMode === 'icon' ? 'icon' : 'image')
          : promptWithCsv.trim() || prompt,
        imagesSnapshot
      )
      const displayText = prompt || (imagesSnapshot.length
        ? t(svgEditor, 'imageOnlyPrompt').replace('{{n}}', String(imagesSnapshot.length))
        : csvSnapshot.length
          ? csvSnapshot.map((c) => t(svgEditor, 'csvOnlyPrompt').replace('{{name}}', c.name)).join(', ')
          : '')
      appendMsg('user', displayText, imagesSnapshot)
      clearPendingAttachments()

      if (!compareOn) {
        // Drop raw image bytes from older turns to keep context light
        history = history.map((m) => {
          if (m.role !== 'user' || !m.parts?.some((p) => p.inlineData)) return m
          return {
            role: 'user',
            text: m.text,
            parts: [{ text: `${m.text || ''}\n[Earlier message included image attachment(s).]` }]
          }
        })
        history.push({
          role: 'user',
          text: displayText,
          parts: userParts
        })
      }

      setSteps(0)
      setStatus(compareOn
        ? t(svgEditor, 'comparing').replace('{{n}}', String(compareIds.length))
        : t(svgEditor, 'stepUnderstanding'))

      const resEarly = svgCanvas.getResolution?.() || { w: 640, h: 480 }
      const canvasSizeEarly = {
        w: Math.round(resEarly.w) || 640,
        h: Math.round(resEarly.h) || 480
      }

      try {
        // Greetings / Q&A — text only, no Max / image / canvas work
        if (!generative && !compareOn) {
          setSteps(1, 'Chat')
          const systemInstruction = buildSystemPrompt({
            w: canvasSizeEarly.w,
            h: canvasSizeEarly.h,
            mode,
            chatOnly: true,
            taskMode,
            continuityNote: buildContinuityNote(history, actionHistory[0] || null)
          })
          const contents = buildContentsForPrompt(false, userParts)
          const reply = await generateGeminiText({
            apiKey,
            model: isRaster || isMax ? resolveActiveModel($id('ai_model')?.value || getModel()) : model,
            contents,
            systemInstruction,
            signal
          })
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const talk = conversationalTextFromReply(reply, null)
          history.push({
            role: 'model',
            text: (talk || reply).slice(0, 8000),
            parts: [{ text: (talk || reply).slice(0, 8000) }]
          })
          appendMsg('model', talk || reply)
          pushActionHistory({
            prompt: displayText,
            mode: 'chat',
            note: 'Reply only (no generation)'
          })
          setSteps(4)
          setStatus(t(svgEditor, 'chatOk'))
          return
        }

        // ——— Max mode: plan then build (SVG + BioRender icons) ———
        if (isMax) {
          setSteps(0, 'Max')
          const result = await runMaxMode({
            svgEditor,
            apiKey,
            textModel: model,
            imageModel,
            userPrompt: prompt || displayText,
            includeCanvas,
            placeMode: mode,
            signal,
            onStep: (idx, detail) => setSteps(idx, detail),
            onPlan: (plan) => {
              const planMsg = formatPlanForChat(plan)
              appendMsg('model', planMsg)
              history.push({
                role: 'model',
                text: planMsg,
                parts: [{ text: planMsg }]
              })
              setSteps(1, plan.title)
            },
            onItem: (item, i, n) => {
              setStatus(t(svgEditor, 'maxBuilding')
                .replace('{{i}}', String(i + 1))
                .replace('{{n}}', String(n))
                .replace('{{id}}', item.id))
            }
          })
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const doneMsg = t(svgEditor, 'maxDone')
            .replace('{{svg}}', String(result.okSvg))
            .replace('{{icons}}', String(result.okIcons))
            .replace('{{fail}}', String(result.fails))
            .replace('{{total}}', String(result.total))
          let detail = doneMsg
          if (result.warnings?.length) {
            detail += `\n\nNotes:\n- ${result.warnings.slice(0, 8).join('\n- ')}`
          }
          if (result.failReasons?.length) {
            detail += `\n\nFailures:\n- ${result.failReasons.slice(0, 8).join('\n- ')}`
          }
          appendMsg('model', detail)
          history.push({
            role: 'model',
            text: detail,
            parts: [{ text: detail }]
          })
          pushActionHistory({
            prompt: displayText,
            mode: 'max',
            note: doneMsg
          })
          setSteps(4)
          setStatus(doneMsg)
          return
        }

        // ——— Image / Icon generation ———
        if (isRaster) {
          setSteps(1, taskMode === 'icon' ? 'Icon' : 'Image')
          setSteps(2, model)
          const contents = [{ role: 'user', parts: userParts }]
          const systemInstruction = taskMode === 'icon'
            ? 'You are an expert BioRender-style scientific icon illustrator. Always return a generated image. Prefer pure white backgrounds suitable for cutout icons. No text overlays unless essential.'
            : 'You are an expert image generator. Always return a generated image that matches the user request.'
          const imgResult = await generateGeminiImage({
            apiKey,
            model,
            contents,
            systemInstruction,
            signal,
            aspectRatio: '1:1'
          })
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          setSteps(3, taskMode === 'icon' ? 'Placing icon…' : 'Placing image…')
          const placed = await placeImageOnCanvas(svgEditor, imgResult.dataUrl, {
            mode,
            icon: taskMode === 'icon',
            maxSize: taskMode === 'icon' ? 160 : 420
          })
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          const note = placed.ok
            ? (taskMode === 'icon' ? '✓ Icon placed on canvas (transparent bg).' : '✓ Image placed on canvas.')
            : (placed.message || 'Could not place image.')
          history.push({
            role: 'model',
            text: imgResult.text || note,
            parts: [{ text: imgResult.text || note }]
          })
          appendMsg('model', imgResult.text || note)
          pushActionHistory({
            prompt: displayText,
            mode: taskMode,
            note: placed.ok ? note : 'Place failed'
          })
          setSteps(4)
          setStatus(placed.ok
            ? (taskMode === 'icon' ? t(svgEditor, 'appliedIcon') : t(svgEditor, 'appliedImage'))
            : (placed.message || t(svgEditor, 'emptyImage')), !placed.ok)
          return
        }

        const res = svgCanvas.getResolution?.() || { w: 640, h: 480 }
        const canvasSize = {
          w: Math.round(res.w) || 640,
          h: Math.round(res.h) || 480
        }
        const effectiveMode = editSelection ? 'append' : mode
        const useBrushes = getUseBrushes()
        const toolPlan = (!compareOn && !editSelection && generative)
          ? resolveToolPlan(prompt || displayText, canvasSize)
          : { placements: [], svgHint: '', activate: null, note: '' }

        if (toolPlan.activate) {
          activateEditorTool(svgEditor, toolPlan.activate.toolId, toolPlan.activate.mode)
          appendMsg('model', toolPlan.note || t(svgEditor, 'toolActivated'))
          history.push({
            role: 'model',
            text: toolPlan.note || t(svgEditor, 'toolActivated'),
            parts: [{ text: toolPlan.note || t(svgEditor, 'toolActivated') }]
          })
          setSteps(4)
          setStatus(toolPlan.note || t(svgEditor, 'toolActivated'))
          return
        }

        const systemInstruction = buildSystemPrompt({
          w: canvasSize.w,
          h: canvasSize.h,
          mode: effectiveMode,
          includeCanvas: editSelection ? false : includeCanvas,
          canvasSvg: (!editSelection && includeCanvas) ? svgCanvas.getSvgString() : '',
          hasImages: imagesSnapshot.length > 0,
          hasCsv: csvSnapshot.length > 0,
          selectionSvg: selectionSvg || undefined,
          selectionSummary: selectionSummary || undefined,
          continuityNote: compareOn
            ? ''
            : buildContinuityNote(history, actionHistory[0] || null),
          useBrushes,
          usePlots,
          plotEngine
        })
        const contents = compareOn
          ? [{ role: 'user', parts: userParts }]
          : buildContentsForPrompt(false, userParts)
        const labelsById = Object.fromEntries(GEMINI_MODELS.map((m) => [m.id, m.label]))

        setSteps(1)
        if (compareOn) {
          setSteps(2, `${compareIds.length} models`)
          const results = await compareGeminiModels({
            apiKey,
            modelIds: compareIds,
            contents,
            systemInstruction,
            labelsById,
            signal
          })
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          renderCompareResults(results, effectiveMode)
          const okCount = results.filter((r) => r.ok && r.svg).length
          setSteps(4)
          setStatus(t(svgEditor, 'compareDone')
            .replace('{{ok}}', String(okCount))
            .replace('{{n}}', String(results.length)))
          pushActionHistory({
            prompt: displayText,
            mode: effectiveMode,
            note: `Compare ${okCount}/${results.length} SVG`
          })
          return
        }

        setSteps(2, model)
        const drawOnce = async (sys, contentsIn, retryNote) => {
          const gen = await generateGeminiTextWithMeta({
            apiKey,
            model,
            contents: contentsIn,
            systemInstruction: sys + (retryNote ? `\n\nRETRY: ${retryNote}` : ''),
            signal
          })
          const replyText = gen.text
          const svgOut = extractSvgFromText(replyText)
          const talkOut = conversationalTextFromReply(replyText, svgOut)
          const diag = {
            ...diagnoseReplyForSvg(replyText, svgOut),
            finishReason: gen.finishReason
          }
          return { reply: replyText, svg: svgOut, talk: talkOut, diag }
        }

        const applyReplyToCanvas = async (replyText, svgOut) => {
          let brushNote = ''
          let plotApplied = null

          if (usePlots && extractPlotSpecFromText(replyText, plotEngine)) {
            setSteps(3, plotEngine === 'echarts' ? 'ECharts' : 'Vega-Lite')
            plotApplied = await applyPlotFromReply(
              svgEditor,
              replyText,
              plotEngine,
              csvSnapshot,
              effectiveMode,
              canvasSize
            )
            if (plotApplied.ok) {
              setStatus(t(svgEditor, 'appliedPlot'))
            }
          }

          if (useBrushes) {
            const toolSpecs = normalizeToolSpecs(
              parseToolsBlockFromReply(replyText),
              canvasSize
            )
            if (toolSpecs.length) {
              setSteps(2, 'Placing brushes…')
              const placed = placeToolsOnCanvas(svgEditor, toolSpecs)
              if (placed.length) {
                brushNote = formatBrushPlacementNote(placed, toolSpecs)
                if (!plotApplied?.ok) setStatus(brushNote)
              }
            }
          }
          if (!svgOut) {
            return {
              ok: !!(brushNote || plotApplied?.ok),
              brushNote,
              plotApplied,
              applied: plotApplied?.ok ? plotApplied : { ok: !!brushNote }
            }
          }
          setSteps(3)
          const applied = await applyOne(svgOut, effectiveMode, { editSelection, signal })
          return {
            ok: applied.ok || !!brushNote || !!plotApplied?.ok,
            brushNote,
            plotApplied,
            applied
          }
        }

        const retryNote = 'Previous SVG was truncated or had invalid XML. Output a SIMPLER drawing: ```tools block first if needed, then ```svg block, no filters/shadows, ≤40 elements, all tags closed, escape every & as &amp; in text.'
        let result = await drawOnce(systemInstruction, contents, '')
        let canvasResult = await applyReplyToCanvas(result.reply, result.svg)
        if (
          result.svg &&
          !canvasResult.applied.ok &&
          (looksLikeTruncatedSvg({ ...result.diag, ...(canvasResult.applied.details || {}) }) ||
            /entityref|xmlParseEntityRef/i.test(String(canvasResult.applied.details?.parserError || canvasResult.applied.message || '')))
        ) {
          setSteps(2, 'Retrying simpler SVG…')
          setStatus(t(svgEditor, 'svgRetry'))
          result = await drawOnce(systemInstruction, contents, retryNote)
          canvasResult = await applyReplyToCanvas(result.reply, result.svg)
          if (canvasResult.applied.ok) {
            result.diag.retried = true
          }
        }

        const { reply, svg, talk, diag: replyDiag } = result
        const { brushNote, applied, ok: canvasOk, plotApplied } = canvasResult
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

        if (svg || brushNote || plotApplied?.ok) {
          if (svg || plotApplied?.ok) setSteps(3)
          history.push({
            role: 'model',
            text: compactModelHistory(reply, svg, canvasOk),
            parts: [{ text: compactModelHistory(reply, svg, canvasOk) }]
          })
          let msg = talk || (canvasOk
            ? (plotApplied?.ok && !svg
              ? t(svgEditor, 'appliedPlot')
              : (editSelection ? '✓ Updated selection.' : '✓ Drawn on the canvas.'))
            : (brushNote || plotApplied?.message || 'SVG returned but could not apply.'))
          if (brushNote && canvasOk) {
            msg = `${brushNote}\n\n${msg}`
          } else if (brushNote && !svg && !plotApplied?.ok) {
            msg = brushNote
          }
          const row = appendMsg('model', msg)
          pushActionHistory({
            prompt: displayText,
            mode: editSelection ? 'edit-selection' : effectiveMode,
            svg: applied.ok ? svg : undefined,
            note: canvasOk
              ? (plotApplied?.ok
                ? `Plot (${plotApplied.engine || plotEngine})`
                : (brushNote ? `${brushNote} ${editSelection ? 'Edited selection' : 'Drawn on canvas'}` : (editSelection ? 'Edited selection' : 'Drawn on canvas')))
              : (brushNote || plotApplied?.message || 'Apply failed')
          })
          setSteps(4)
          if (plotApplied && !plotApplied.ok && !applied.ok) {
            showApplyFailure(plotApplied.message || t(svgEditor, 'plotFailed'), {
              stage: 'plot',
              engine: plotApplied.engine,
              message: plotApplied.message
            }, { row })
          } else if (svg && !applied.ok) {
            const userMsg = formatUserFacingSvgError({
              ...replyDiag,
              ...(applied.details || {})
            }, applied.message)
            showApplyFailure(userMsg, {
              ...replyDiag,
              ...(applied.details || {}),
              stage: 'apply-after-extract'
            }, { row })
          } else if (brushNote && !svg && !plotApplied?.ok) {
            setStatus(brushNote)
          } else if (plotApplied?.ok && !svg) {
            setStatus(t(svgEditor, 'appliedPlot'))
          }
          return
        }

        history.push({
          role: 'model',
          text: reply.slice(0, 8000),
          parts: [{ text: reply.slice(0, 8000) }]
        })
        const noSvgRow = appendMsg('model', talk || reply.slice(0, 2000))
        // Reply looked like it tried to draw but extract failed
        if (replyDiag.hasSvgOpen || /```\s*svg/i.test(reply) || (usePlots && /```\s*(?:vega-lite|echarts)/i.test(reply))) {
          showApplyFailure(formatUserFacingSvgError(replyDiag, t(svgEditor, 'emptySvg')), {
            ...replyDiag,
            stage: 'extract',
            messageHint: 'Model reply contained SVG markers but no usable fragment was extracted (often truncated output).'
          }, { row: noSvgRow })
          pushActionHistory({
            prompt: displayText,
            mode: effectiveMode,
            note: 'Extract failed'
          })
        } else {
          pushActionHistory({
            prompt: displayText,
            mode: 'chat',
            note: 'Reply only (no SVG)'
          })
          setStatus(t(svgEditor, 'chatOk'))
        }
        setSteps(4)
        return
      } catch (err) {
        if (err?.name === 'AbortError' || signal.aborted) {
          appendMsg('model', t(svgEditor, 'stopped'))
          setStatus(t(svgEditor, 'stopped'))
          hideSteps()
          return
        }
        const msg = err?.message || String(err)
        appendMsg('model', `${t(svgEditor, 'errorPrefix')}: ${msg}`)
        setStatus(msg, true)
        hideSteps()
      } finally {
        activeAbort = null
        setBusyUi(false)
        setTimeout(hideSteps, 1200)
      }
    }

    const refreshModelsFromApi = async () => {
      const apiKey = ($id('ai_api_key')?.value || getApiKey()).trim()
      if (!apiKey) {
        setStatus(t(svgEditor, 'needKey'), true)
        return
      }
      const taskMode = $id('ai_task_mode')?.value || getTaskMode()
      const isRaster = taskMode === 'image' || taskMode === 'icon'
      setStatus(t(svgEditor, 'refreshingModels'))
      try {
        const remote = await listGeminiModels(apiKey, { includeImage: isRaster })
        const remoteIds = new Set(remote.map((m) => m.id))
        const sel = $id('ai_model')
        const catalog = isRaster ? GEMINI_IMAGE_MODELS : GEMINI_MODELS
        const preferred = catalog.filter((m) => remoteIds.has(m.id))
        const extras = remote
          .filter((m) => !catalog.some((c) => c.id === m.id))
          .filter((m) => /gemini/i.test(m.id))
          .slice(0, 12)
          .map((m) => ({ id: m.id, label: m.displayName || m.id }))

        if (sel) {
          const current = sel.value
          sel.innerHTML = ''
          preferred.forEach((m) => {
            const opt = document.createElement('option')
            opt.value = m.id
            opt.textContent = `${m.label} ✓`
            sel.appendChild(opt)
          })
          catalog.filter((m) => !remoteIds.has(m.id)).forEach((m) => {
            const opt = document.createElement('option')
            opt.value = m.id
            opt.textContent = `${m.label} (not listed)`
            sel.appendChild(opt)
          })
          extras.forEach((m) => {
            const opt = document.createElement('option')
            opt.value = m.id
            opt.textContent = m.label
            sel.appendChild(opt)
          })
          if ([...sel.options].some((o) => o.value === current)) sel.value = current
          else if (preferred[0]) sel.value = preferred[0].id
          if (isRaster) localStorage.setItem(LS_IMAGE_MODEL, sel.value)
          else localStorage.setItem(LS_MODEL, sel.value)
        }

        // Update compare checkboxes availability hints
        $id('ai_compare_models')?.querySelectorAll('input[data-model]').forEach((input) => {
          const id = input.getAttribute('data-model')
          const label = input.parentElement
          if (!label) return
          const available = remoteIds.has(id)
          label.classList.toggle('unavailable', !available)
          label.title = available ? '' : t(svgEditor, 'modelUnavailable')
        })

        setStatus(t(svgEditor, 'modelsRefreshed').replace('{{n}}', String(remote.length)))
      } catch (err) {
        setStatus(err?.message || String(err), true)
      }
    }

    return {
      name: t(svgEditor, 'name'),
      callback () {
        const buttonTemplate = document.createElement('template')
        buttonTemplate.innerHTML = `
          <se-button id="tool_aichat" title="${t(svgEditor, 'buttons.0.title')}" src="aichat.svg"></se-button>
        `
        const toolsLeft = $id('tools_left')
        if (toolsLeft?.firstChild) {
          toolsLeft.insertBefore(buttonTemplate.content.cloneNode(true), toolsLeft.firstChild)
        } else {
          toolsLeft?.append(buttonTemplate.content.cloneNode(true))
        }

        const modelOptions = GEMINI_MODELS.map((m) => {
          const mark = m.powerful ? ' ★' : ''
          return `<option value="${m.id}">${m.label}${mark}</option>`
        }).join('')

        const savedCompare = new Set(getCompareModels())
        const compareChecks = GEMINI_MODELS.map((m) => {
          const checked = savedCompare.has(m.id) ? 'checked' : ''
          const star = m.powerful ? ' ★' : ''
          return `<label class="ai_check ai_compare_item"><input type="checkbox" data-model="${m.id}" ${checked}/><span>${m.label}${star}</span></label>`
        }).join('')

        const panel = document.createElement('div')
        panel.id = 'ai_chat_panel'
        panel.className = 'ai_chat_panel'
        panel.setAttribute('aria-hidden', 'true')
        panel.innerHTML = `
          <div class="ai_chat_header">
            <strong>${t(svgEditor, 'panelTitle')}</strong>
            <button type="button" id="ai_chat_close" class="ai_chat_icon_btn" title="${t(svgEditor, 'close')}">×</button>
          </div>
          <div class="ai_chat_settings">
            <label class="ai_field">
              <span>${t(svgEditor, 'apiKeyLabel')}</span>
              <input type="password" id="ai_api_key" autocomplete="off" spellcheck="false"
                placeholder="${t(svgEditor, 'apiKeyPlaceholder')}" />
            </label>
            <p class="ai_hint">${t(svgEditor, 'apiKeyHint')}</p>
            <div class="ai_row">
              <button type="button" id="ai_refresh_models" class="ai_btn secondary">${t(svgEditor, 'refreshModels')}</button>
            </div>
            <div id="ai_model_wrap">
              <label class="ai_field">
                <span id="ai_model_label">${t(svgEditor, 'modelLabel')}</span>
                <select id="ai_model">${modelOptions}</select>
              </label>
            </div>
            <div id="ai_max_image_wrap" style="display:none">
              <label class="ai_field">
                <span>${t(svgEditor, 'modelLabelIcon')}</span>
                <select id="ai_max_image_model"></select>
              </label>
            </div>
            <label class="ai_field">
              <span>${t(svgEditor, 'taskLabel')}</span>
              <select id="ai_task_mode">
                <option value="draw">${t(svgEditor, 'taskDraw')}</option>
                <option value="image">${t(svgEditor, 'taskImage')}</option>
                <option value="icon">${t(svgEditor, 'taskIcon')}</option>
                <option value="max">${t(svgEditor, 'taskMax')}</option>
              </select>
            </label>
            <p class="ai_hint" id="ai_task_hint">${t(svgEditor, 'taskHint')}</p>
            <div id="ai_compare_wrap">
            <label class="ai_check">
              <input type="checkbox" id="ai_compare_on" />
              <span>${t(svgEditor, 'compareLabel')}</span>
            </label>
            <p class="ai_hint">${t(svgEditor, 'compareHint')}</p>
            <div id="ai_compare_models" class="ai_compare_models" style="display:none">
              ${compareChecks}
            </div>
            </div>
            <label class="ai_field">
              <span>${t(svgEditor, 'modeLabel')}</span>
              <select id="ai_draw_mode">
                <option value="append">${t(svgEditor, 'modeAppend')}</option>
                <option value="replace">${t(svgEditor, 'modeReplace')}</option>
              </select>
            </label>
            <div id="ai_draw_options">
            <label class="ai_check">
              <input type="checkbox" id="ai_include_canvas" checked />
              <span>${t(svgEditor, 'includeCanvas')}</span>
            </label>
            <label class="ai_check">
              <input type="checkbox" id="ai_use_brushes" />
              <span>${t(svgEditor, 'useBrushes')}</span>
            </label>
            <p class="ai_hint">${t(svgEditor, 'useBrushesHint')}</p>
            <label class="ai_check">
              <input type="checkbox" id="ai_use_plots" />
              <span>${t(svgEditor, 'usePlots')}</span>
            </label>
            <p class="ai_hint">${t(svgEditor, 'usePlotsHint')}</p>
            <div id="ai_plot_engine_wrap" style="display:none">
              <label class="ai_field">
                <span>${t(svgEditor, 'plotEngineLabel')}</span>
                <select id="ai_plot_engine">
                  <option value="vega">${t(svgEditor, 'plotEngineVega')}</option>
                  <option value="echarts">${t(svgEditor, 'plotEngineEcharts')}</option>
                </select>
              </label>
            </div>
            <label class="ai_check">
              <input type="checkbox" id="ai_edit_selection" />
              <span>${t(svgEditor, 'editSelection')}</span>
            </label>
            <p class="ai_hint">${t(svgEditor, 'editSelectionHint')}</p>
            </div>
            <div class="ai_row">
              <button type="button" id="ai_history_toggle" class="ai_btn secondary">${t(svgEditor, 'showHistory')}</button>
            </div>
            <div id="ai_history_panel" class="ai_history_panel" style="display:none">
              <div id="ai_history_list" class="ai_history_list"></div>
            </div>
          </div>
          <div id="ai_chat_log" class="ai_chat_log"></div>
          <div id="ai_steps" class="ai_steps" style="display:none" aria-live="polite"></div>
          <div id="ai_chat_status" class="ai_chat_status"></div>
          <div class="ai_chat_composer">
            <div id="ai_attach_strip" class="ai_attach_strip" style="display:none"></div>
            <textarea id="ai_chat_input" rows="3" placeholder="${t(svgEditor, 'placeholder')}"></textarea>
            <input type="file" id="ai_image_input" accept="image/*" multiple hidden />
            <input type="file" id="ai_csv_input" accept=".csv,text/csv" multiple hidden />
            <div class="ai_chat_actions">
              <button type="button" id="ai_chat_attach" class="ai_btn secondary" title="${t(svgEditor, 'attachImagesTitle')}">${t(svgEditor, 'attachImages')}</button>
              <button type="button" id="ai_chat_attach_csv" class="ai_btn secondary" style="display:none" title="${t(svgEditor, 'attachCsvTitle')}">${t(svgEditor, 'attachCsv')}</button>
              <button type="button" id="ai_chat_clear" class="ai_btn secondary">${t(svgEditor, 'clearChat')}</button>
              <button type="button" id="ai_chat_stop" class="ai_btn danger" style="display:none">${t(svgEditor, 'stop')}</button>
              <button type="button" id="ai_chat_send" class="ai_btn primary">${t(svgEditor, 'send')}</button>
            </div>
            <p class="ai_hint ai_attach_hint" id="ai_attach_hint">${t(svgEditor, 'attachHint')}</p>
          </div>
        `

        const editorRoot = document.querySelector('.svg_editor')
        editorRoot?.appendChild(panel)

        const keyInput = $id('ai_api_key')
        if (keyInput) keyInput.value = getApiKey()
        const taskSel = $id('ai_task_mode')
        if (taskSel) taskSel.value = getTaskMode()
        syncTaskModeUi()
        const compareToggle = $id('ai_compare_on')
        if (compareToggle) compareToggle.checked = getCompareOn()
        const brushesToggle = $id('ai_use_brushes')
        if (brushesToggle) {
          brushesToggle.checked = getUseBrushes()
          brushesToggle.addEventListener('change', () => {
            localStorage.setItem(LS_USE_BRUSHES, brushesToggle.checked ? '1' : '0')
          })
        }
        const plotsToggle = $id('ai_use_plots')
        if (plotsToggle) {
          plotsToggle.checked = getUsePlots()
          plotsToggle.addEventListener('change', () => {
            localStorage.setItem(LS_USE_PLOTS, plotsToggle.checked ? '1' : '0')
            syncPlotUi()
          })
        }
        const plotEngineSel = $id('ai_plot_engine')
        if (plotEngineSel) {
          plotEngineSel.value = getPlotEngine()
          plotEngineSel.addEventListener('change', () => {
            localStorage.setItem(LS_PLOT_ENGINE, plotEngineSel.value === 'echarts' ? 'echarts' : 'vega')
          })
        }
        syncPlotUi()
        syncCompareUi()

        $click($id('tool_aichat'), () => {
          const open = !document.querySelector('.svg_editor')?.classList.contains('ai-chat-open')
          setOpen(open)
        })
        $click($id('ai_chat_close'), () => setOpen(false))
        $click($id('ai_chat_send'), () => { send() })
        $click($id('ai_chat_stop'), () => { stopGeneration() })
        $click($id('ai_refresh_models'), () => { refreshModelsFromApi() })
        $click($id('ai_chat_attach'), () => $id('ai_image_input')?.click())
        $click($id('ai_chat_attach_csv'), () => $id('ai_csv_input')?.click())
        $id('ai_image_input')?.addEventListener('change', (e) => {
          const files = e.target?.files
          if (files?.length) addImageFiles(files)
          e.target.value = ''
        })
        $id('ai_csv_input')?.addEventListener('change', (e) => {
          const files = e.target?.files
          if (files?.length) addCsvFiles(files)
          e.target.value = ''
        })
        $click($id('ai_chat_clear'), () => {
          if (busy) stopGeneration()
          history = []
          compareSvgCache.clear()
          clearPendingAttachments()
          const log = $id('ai_chat_log')
          if (log) log.innerHTML = ''
          setStatus('')
          hideSteps()
        })
        $click($id('ai_history_toggle'), () => {
          const panel = $id('ai_history_panel')
          if (!panel) return
          const open = panel.style.display === 'none'
          panel.style.display = open ? 'block' : 'none'
          $id('ai_history_toggle').textContent = open
            ? t(svgEditor, 'hideHistory')
            : t(svgEditor, 'showHistory')
          if (open) renderActionHistory()
        })
        renderActionHistory()

        taskSel?.addEventListener('change', syncTaskModeUi)
        compareToggle?.addEventListener('change', syncCompareUi)
        $id('ai_compare_models')?.addEventListener('change', persistCompareModels)

        keyInput?.addEventListener('change', () => {
          localStorage.setItem(LS_KEY, keyInput.value.trim())
        })
        $id('ai_model')?.addEventListener('change', () => {
          const task = $id('ai_task_mode')?.value || 'draw'
          const val = $id('ai_model').value
          if (task === 'image' || task === 'icon') localStorage.setItem(LS_IMAGE_MODEL, val)
          else localStorage.setItem(LS_MODEL, val)
        })
        $id('ai_max_image_model')?.addEventListener('change', () => {
          localStorage.setItem(LS_IMAGE_MODEL, $id('ai_max_image_model').value)
        })

        const composer = panel.querySelector('.ai_chat_composer')
        const onPasteAttachments = (e) => {
          const images = imageFilesFromDataTransfer(e.clipboardData)
          const csvs = csvFilesFromDataTransfer(e.clipboardData)
          if (!images.length && !csvs.length) return
          e.preventDefault()
          if (images.length) addImageFiles(images)
          if (csvs.length) addCsvFiles(csvs)
        }
        const onDropAttachments = (e) => {
          const images = imageFilesFromDataTransfer(e.dataTransfer)
          const csvs = csvFilesFromDataTransfer(e.dataTransfer)
          if (!images.length && !csvs.length) return
          e.preventDefault()
          if (images.length) addImageFiles(images)
          if (csvs.length) addCsvFiles(csvs)
        }
        panel.addEventListener('paste', onPasteAttachments)
        composer?.addEventListener('dragover', (e) => {
          const images = imageFilesFromDataTransfer(e.dataTransfer)
          const csvs = csvFilesFromDataTransfer(e.dataTransfer)
          if (images.length || csvs.length) {
            e.preventDefault()
            composer.classList.add('ai-drag-over')
          }
        })
        composer?.addEventListener('dragleave', () => composer.classList.remove('ai-drag-over'))
        composer?.addEventListener('drop', (e) => {
          composer.classList.remove('ai-drag-over')
          onDropAttachments(e)
        })

        $id('ai_chat_input')?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        })

        if (localStorage.getItem(LS_OPEN) === '1') setOpen(true)
        ensureAskTip()
      },
      selectedChanged (opts) {
        updateAskTip(opts?.elems)
      },
      elementTransition () {
        if (tipElems.length || (svgCanvas.getSelectedElements?.() || []).some(Boolean)) {
          scheduleAskTipReposition()
        }
      },
      elementChanged () {
        if (tipElems.length || (svgCanvas.getSelectedElements?.() || []).some(Boolean)) {
          scheduleAskTipReposition()
        }
      },
      canvasUpdated () {
        scheduleAskTipReposition()
      },
      zoomChanged () {
        scheduleAskTipReposition()
      }
    }
  }
}
