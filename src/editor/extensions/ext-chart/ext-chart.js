/**
 * @file ext-chart.js — Chart properties tab + real-time Vega-Lite editing.
 */

import {
  findChartGroup,
  readPlotSpec,
  getMarkType,
  setMarkType,
  getTitle,
  setTitle,
  specColumnNames,
  rerenderChartGroup
} from './chart-spec.js'
import { VEGA_MARK_TYPES } from './chart-templates.js'

const name = 'chart'

const loadExtensionTranslation = async function (svgEditor) {
  let translationModule
  const lang = svgEditor.configObj.pref('lang')
  try {
    translationModule = await import(`./locale/${lang}.js`)
  } catch (_error) {
    translationModule = await import('./locale/en.js')
  }
  svgEditor.i18next.addResourceBundle(lang, name, translationModule.default)
}

const t = (svgEditor, key) => svgEditor.i18next.t(`${name}:${key}`)

/**
 * @param {object} spec
 */
function encodingField (spec, channel) {
  const enc = spec?.encoding?.[channel]
  if (!enc) return ''
  if (typeof enc.field === 'string') return enc.field
  if (Array.isArray(enc)) return enc[0]?.field || ''
  return ''
}

/**
 * @param {object} spec
 * @param {string} channel
 * @param {string} field
 * @param {string} [type]
 */
function setEncodingField (spec, channel, field, type = 'quantitative') {
  const copy = JSON.parse(JSON.stringify(spec))
  if (!copy.encoding) copy.encoding = {}
  if (!field) {
    delete copy.encoding[channel]
    return copy
  }
  const prev = copy.encoding[channel]
  const inferred = /count|value|score|amount|rate|percent|fold|expression/i.test(field)
    ? 'quantitative'
    : 'nominal'
  copy.encoding[channel] = {
    ...(prev && typeof prev === 'object' ? prev : {}),
    field,
    type: prev?.type || type || inferred
  }
  return copy
}

export default {
  name,
  async init () {
    const svgEditor = this
    await loadExtensionTranslation(svgEditor)
    const { svgCanvas } = svgEditor
    const { $id } = svgCanvas

    let activeGroup = null
    let rerenderTimer = 0
    let busy = false

    const showPanel = (on) => {
      const panel = $id('chart_panel')
      const hint = $id('chart_panel_hint')
      if (panel) panel.style.display = on ? 'block' : 'none'
      if (hint) hint.style.display = on ? 'none' : 'block'
    }

    const fillSelect = (sel, options, selected) => {
      if (!sel) return
      sel.innerHTML = ''
      const blank = document.createElement('option')
      blank.value = ''
      blank.textContent = '—'
      sel.appendChild(blank)
      options.forEach((opt) => {
        const o = document.createElement('option')
        o.value = opt
        o.textContent = opt
        if (opt === selected) o.selected = true
        sel.appendChild(o)
      })
    }

    const syncPanelFromGroup = (group) => {
      activeGroup = group
      const spec = readPlotSpec(group)
      const markSel = $id('chart_mark_type')
      const titleIn = $id('chart_title')
      const xSel = $id('chart_x_field')
      const ySel = $id('chart_y_field')
      const colorSel = $id('chart_color_field')
      const wIn = $id('chart_width')
      const hIn = $id('chart_height')
      if (!spec) {
        showPanel(false)
        return
      }
      showPanel(true)
      const mark = getMarkType(spec)
      if (markSel) {
        const match = VEGA_MARK_TYPES.find((m) => m.mark === mark)
        markSel.value = match?.id || 'bar'
      }
      if (titleIn) titleIn.value = getTitle(spec)
      const cols = specColumnNames(spec)
      fillSelect(xSel, cols, encodingField(spec, 'x') || encodingField(spec, 'theta'))
      fillSelect(ySel, cols, encodingField(spec, 'y'))
      fillSelect(colorSel, cols, encodingField(spec, 'color'))
      if (wIn) wIn.value = String(spec.width || 480)
      if (hIn) hIn.value = String(spec.height || 300)
    }

    const readPanelToSpec = () => {
      const spec = readPlotSpec(activeGroup)
      if (!spec) return null
      let next = JSON.parse(JSON.stringify(spec))
      const tpl = VEGA_MARK_TYPES.find((m) => m.id === $id('chart_mark_type')?.value)
      if (tpl) next = setMarkType(next, tpl.mark)
      next = setTitle(next, ($id('chart_title')?.value || '').trim())
      const x = $id('chart_x_field')?.value
      const y = $id('chart_y_field')?.value
      const color = $id('chart_color_field')?.value
      if (getMarkType(next) === 'arc') {
        if (x) next = setEncodingField(next, 'color', x, 'nominal')
        if (y) next = setEncodingField(next, 'theta', y, 'quantitative')
      } else {
        if (x) next = setEncodingField(next, 'x', x)
        if (y) next = setEncodingField(next, 'y', y)
      }
      if (color) next = setEncodingField(next, 'color', color, 'nominal')
      else if (next.encoding?.color && !$id('chart_color_field')?.value) {
        delete next.encoding.color
      }
      const w = Number($id('chart_width')?.value)
      const h = Number($id('chart_height')?.value)
      if (Number.isFinite(w) && w > 0) next.width = w
      if (Number.isFinite(h) && h > 0) next.height = h
      return next
    }

    const scheduleRerender = () => {
      if (!activeGroup || busy) return
      clearTimeout(rerenderTimer)
      rerenderTimer = window.setTimeout(async () => {
        const spec = readPanelToSpec()
        if (!spec || !activeGroup) return
        busy = true
        try {
          await rerenderChartGroup(svgEditor, activeGroup, spec)
        } catch (err) {
          console.warn('Chart rerender failed', err)
        } finally {
          busy = false
        }
      }, 280)
    }

    const openChartTab = () => {
      svgEditor.rightPanel?.switchTab?.('charts')
    }

    return {
      name: t(svgEditor, 'name'),
      callback () {
        const markOptions = VEGA_MARK_TYPES.map((m) =>
          `<option value="${m.id}">${m.label}</option>`
        ).join('')

        const host = $id('right_charts_extensions') || $id('right_properties_extensions')
        if (!host) return

        const wrap = document.createElement('div')
        wrap.id = 'chart_panel_wrap'
        wrap.innerHTML = `
          <p id="chart_panel_hint" class="right_panel_hint">${t(svgEditor, 'panelHint')}</p>
          <div id="chart_panel" class="chart_panel prop-section" style="display:none">
            <div class="prop-header">${t(svgEditor, 'panelTitle')}</div>
            <label class="ai_field">
              <span>${t(svgEditor, 'markType')}</span>
              <select id="chart_mark_type">${markOptions}</select>
            </label>
            <label class="ai_field">
              <span>${t(svgEditor, 'title')}</span>
              <input type="text" id="chart_title" spellcheck="false" />
            </label>
            <label class="ai_field">
              <span>${t(svgEditor, 'xField')}</span>
              <select id="chart_x_field"></select>
            </label>
            <label class="ai_field">
              <span>${t(svgEditor, 'yField')}</span>
              <select id="chart_y_field"></select>
            </label>
            <label class="ai_field">
              <span>${t(svgEditor, 'colorField')}</span>
              <select id="chart_color_field"></select>
            </label>
            <div class="prop-row prop-row-2">
              <label class="ai_field">
                <span>${t(svgEditor, 'width')}</span>
                <input type="number" id="chart_width" min="120" max="2000" step="10" />
              </label>
              <label class="ai_field">
                <span>${t(svgEditor, 'height')}</span>
                <input type="number" id="chart_height" min="100" max="2000" step="10" />
              </label>
            </div>
            <div class="ai_row">
              <button type="button" id="chart_apply_btn" class="ai_btn secondary">${t(svgEditor, 'apply')}</button>
              <button type="button" id="chart_ask_ai_btn" class="ai_btn secondary">${t(svgEditor, 'askAi')}</button>
            </div>
          </div>
        `
        host.appendChild(wrap)

        ;['chart_mark_type', 'chart_x_field', 'chart_y_field', 'chart_color_field'].forEach((id) => {
          $id(id)?.addEventListener('change', scheduleRerender)
        })
        ;['chart_title', 'chart_width', 'chart_height'].forEach((id) => {
          $id(id)?.addEventListener('input', scheduleRerender)
        })
        $id('chart_apply_btn')?.addEventListener('click', () => scheduleRerender())
        $id('chart_ask_ai_btn')?.addEventListener('click', () => {
          const editCb = $id('ai_edit_selection')
          if (editCb) editCb.checked = true
          const root = document.querySelector('.svg_editor')
          if (!root?.classList.contains('ai-chat-open')) {
            $id('tool_aichat')?.click()
          }
          const input = $id('ai_chat_input')
          if (input) {
            input.value = 'Update this chart: '
            input.focus()
          }
        })
      },
      selectedChanged (opts) {
        const elems = opts?.elems?.filter(Boolean) || []
        if (!elems.length) {
          activeGroup = null
          showPanel(false)
          return
        }
        const group = findChartGroup(elems[0])
        if (!group) {
          activeGroup = null
          showPanel(false)
          return
        }
        syncPanelFromGroup(group)
        openChartTab()
      },
      elementChanged () {
        if (activeGroup && !activeGroup.parentNode) {
          activeGroup = null
          showPanel(false)
        }
      }
    }
  }
}
