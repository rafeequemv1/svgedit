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
  generateGeminiImage,
  extractSvgFromText,
  compareGeminiModels,
  listGeminiModels
} from './gemini.js'
import { applySvgToCanvas, buildSystemPrompt, conversationalTextFromReply, compactModelHistory } from './apply-svg.js'
import {
  applySvgToCanvasAnimated,
  replaceSelectionWithSvg,
  serializeSelection
} from './reveal-svg.js'
import { placeImageOnCanvas, buildRasterPrompt } from './place-image.js'
import { runMaxMode, formatPlanForChat } from './max-mode.js'
import {
  blobToGeminiImage,
  imageFilesFromDataTransfer,
  buildUserParts,
  MAX_IMAGES
} from './image-attach.js'

const name = 'aichat'
const LS_KEY = 'svgedit.gemini.apiKey'
const LS_MODEL = 'svgedit.gemini.model'
const LS_IMAGE_MODEL = 'svgedit.gemini.imageModel'
const LS_TASK = 'svgedit.aichat.task'
const LS_OPEN = 'svgedit.aichat.open'
const LS_COMPARE = 'svgedit.aichat.compare'
const LS_COMPARE_MODELS = 'svgedit.aichat.compareModels'

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
    let imageIdSeq = 0
    /** @type {AbortController|null} */
    let activeAbort = null
    /** @type {Array<{id:string, at:number, prompt:string, mode:string, svg?:string, note:string}>} */
    let actionHistory = []

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

    const renderPendingImages = () => {
      const strip = $id('ai_attach_strip')
      if (!strip) return
      strip.innerHTML = ''
      strip.style.display = pendingImages.length ? 'flex' : 'none'
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
          renderPendingImages()
        })
        chip.appendChild(thumb)
        chip.appendChild(rm)
        strip.appendChild(chip)
      })
    }

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

    const clearPendingImages = () => {
      pendingImages = []
      renderPendingImages()
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
          setStatus(result.message || fallback.message || t(svgEditor, 'emptySvg'), true)
          return false
        }
      }
      setStatus(editSelection
        ? t(svgEditor, 'appliedSelection')
        : (mode === 'replace'
          ? t(svgEditor, 'appliedReplace')
          : t(svgEditor, 'appliedAppend')))
      return true
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
              const ok = await applyOne(svg, mode)
              if (ok) {
                pushActionHistory({
                  prompt: 'Compare apply',
                  mode,
                  svg,
                  note: `Applied ${r.label}`
                })
                setSteps(4)
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
      const recent = history.slice(-16)
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
      const editSelection = !isRaster && !isMax && !!$id('ai_edit_selection')?.checked
      const selectionSvg = editSelection ? serializeSelection(svgCanvas) : ''
      const imagesSnapshot = pendingImages.map((p) => ({
        mimeType: p.mimeType,
        data: p.data,
        previewUrl: p.previewUrl,
        name: p.name
      }))

      if (!apiKey) {
        setStatus(t(svgEditor, 'needKey'), true)
        $id('ai_api_key')?.focus()
        return
      }
      if (!prompt && !imagesSnapshot.length) return
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
      const userParts = buildUserParts(
        isRaster ? buildRasterPrompt(prompt, taskMode === 'icon' ? 'icon' : 'image') : prompt,
        imagesSnapshot
      )
      const displayText = prompt || (imagesSnapshot.length
        ? t(svgEditor, 'imageOnlyPrompt').replace('{{n}}', String(imagesSnapshot.length))
        : '')
      appendMsg('user', displayText, imagesSnapshot)
      clearPendingImages()

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

      try {
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
          appendMsg('model', doneMsg)
          history.push({
            role: 'model',
            text: doneMsg,
            parts: [{ text: doneMsg }]
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
        const effectiveMode = editSelection ? 'append' : mode
        const systemInstruction = buildSystemPrompt({
          w: Math.round(res.w) || 640,
          h: Math.round(res.h) || 480,
          mode: effectiveMode,
          includeCanvas: editSelection ? false : includeCanvas,
          canvasSvg: (!editSelection && includeCanvas) ? svgCanvas.getSvgString() : '',
          hasImages: imagesSnapshot.length > 0,
          selectionSvg: selectionSvg || undefined
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
        const reply = await generateGeminiText({
          apiKey,
          model,
          contents,
          systemInstruction,
          signal
        })
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')

        const svg = extractSvgFromText(reply)
        const talk = conversationalTextFromReply(reply, svg)

        if (svg) {
          setSteps(3)
          const applied = await applyOne(svg, effectiveMode, { editSelection, signal })
          if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
          history.push({
            role: 'model',
            text: compactModelHistory(reply, svg, applied),
            parts: [{ text: compactModelHistory(reply, svg, applied) }]
          })
          appendMsg('model', talk || (applied
            ? (editSelection ? '✓ Updated selection.' : '✓ Drawn on the canvas.')
            : 'SVG returned but could not apply.'))
          pushActionHistory({
            prompt: displayText,
            mode: editSelection ? 'edit-selection' : effectiveMode,
            svg: applied ? svg : undefined,
            note: applied
              ? (editSelection ? 'Edited selection' : 'Drawn on canvas')
              : 'Apply failed'
          })
          setSteps(4)
          if (!applied) {
            setStatus(t(svgEditor, 'emptySvg'), true)
          }
          return
        }

        history.push({
          role: 'model',
          text: reply.slice(0, 8000),
          parts: [{ text: reply.slice(0, 8000) }]
        })
        appendMsg('model', talk || reply.slice(0, 2000))
        pushActionHistory({
          prompt: displayText,
          mode: 'chat',
          note: 'Reply only (no SVG)'
        })
        setSteps(4)
        setStatus(t(svgEditor, 'chatOk'))
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
            <div class="ai_chat_actions">
              <button type="button" id="ai_chat_attach" class="ai_btn secondary" title="${t(svgEditor, 'attachImagesTitle')}">${t(svgEditor, 'attachImages')}</button>
              <button type="button" id="ai_chat_clear" class="ai_btn secondary">${t(svgEditor, 'clearChat')}</button>
              <button type="button" id="ai_chat_stop" class="ai_btn danger" style="display:none">${t(svgEditor, 'stop')}</button>
              <button type="button" id="ai_chat_send" class="ai_btn primary">${t(svgEditor, 'send')}</button>
            </div>
            <p class="ai_hint ai_attach_hint">${t(svgEditor, 'attachHint')}</p>
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
        $id('ai_image_input')?.addEventListener('change', (e) => {
          const files = e.target?.files
          if (files?.length) addImageFiles(files)
          e.target.value = ''
        })
        $click($id('ai_chat_clear'), () => {
          if (busy) stopGeneration()
          history = []
          compareSvgCache.clear()
          clearPendingImages()
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
        const onPasteImages = (e) => {
          const files = imageFilesFromDataTransfer(e.clipboardData)
          if (!files.length) return
          e.preventDefault()
          addImageFiles(files)
        }
        const onDropImages = (e) => {
          const files = imageFilesFromDataTransfer(e.dataTransfer)
          if (!files.length) return
          e.preventDefault()
          addImageFiles(files)
        }
        panel.addEventListener('paste', onPasteImages)
        composer?.addEventListener('dragover', (e) => {
          if (imageFilesFromDataTransfer(e.dataTransfer).length) {
            e.preventDefault()
            composer.classList.add('ai-drag-over')
          }
        })
        composer?.addEventListener('dragleave', () => composer.classList.remove('ai-drag-over'))
        composer?.addEventListener('drop', (e) => {
          composer.classList.remove('ai-drag-over')
          onDropImages(e)
        })

        $id('ai_chat_input')?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            send()
          }
        })

        if (localStorage.getItem(LS_OPEN) === '1') setOpen(true)
      }
    }
  }
}
