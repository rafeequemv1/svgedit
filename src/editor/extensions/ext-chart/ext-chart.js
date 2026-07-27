/**
 * @file ext-chart.js — Chart properties tab + real-time Vega-Lite editing.
 */

import {
  findChartGroup,
  readPlotSpec,
  specColumnNames,
  rerenderChartGroup
} from './chart-spec.js'
import { buildMarkTypeSelectHtml, guessTemplateIdFromSpec, buildTemplateSpec } from './chart-templates.js'
import {
  COLOR_SCHEMES,
  applyControlValues,
  bindColorPair,
  bindRangeNumber,
  colorFieldHtml,
  encodingField,
  hasColorField,
  rangeFieldHtml,
  readControlValues
} from './chart-controls.js'

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
    let pendingRerender = false

    const setStatus = (msg) => {
      const el = $id('chart_panel_status')
      if (el) el.textContent = msg || ''
    }

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

    const setRangeNumber = (baseId, value) => {
      const num = $id(baseId)
      const range = $id(`${baseId}_range`)
      if (num) num.value = String(value)
      if (range) range.value = String(value)
    }

    const setColorPair = (baseId, value) => {
      const text = $id(baseId)
      const picker = $id(`${baseId}_picker`)
      if (text) text.value = value || ''
      if (picker && value) picker.value = value
    }

    const toggleColorMode = (spec) => {
      const fixedWrap = $id('chart_fixed_color_wrap')
      const schemeWrap = $id('chart_scheme_wrap')
      const useScheme = hasColorField(spec)
      if (fixedWrap) fixedWrap.style.display = useScheme ? 'none' : ''
      if (schemeWrap) schemeWrap.style.display = useScheme ? '' : 'none'
    }

    const syncPanelFromGroup = (group) => {
      activeGroup = group
      const spec = readPlotSpec(group)
      if (!spec) {
        showPanel(false)
        return
      }
      showPanel(true)

      const vals = readControlValues(spec)
      const tplId = guessTemplateIdFromSpec(spec)
      const cols = specColumnNames(spec)

      if ($id('chart_mark_type')) $id('chart_mark_type').value = tplId
      if ($id('chart_title')) $id('chart_title').value = vals.title
      fillSelect($id('chart_x_field'), cols, encodingField(spec, 'x') || encodingField(spec, 'theta'))
      fillSelect($id('chart_y_field'), cols, encodingField(spec, 'y'))
      fillSelect($id('chart_color_field'), cols, encodingField(spec, 'color'))
      fillSelect($id('chart_size_field'), cols, encodingField(spec, 'size'))

      setRangeNumber('chart_width', vals.width)
      setRangeNumber('chart_height', vals.height)
      setRangeNumber('chart_opacity', vals.opacity)
      setRangeNumber('chart_stroke_width', vals.strokeWidth)
      setRangeNumber('chart_point_size', vals.pointSize)
      setRangeNumber('chart_inner_radius', vals.innerRadius)
      setRangeNumber('chart_padding', vals.padding)

      setColorPair('chart_mark_fill', vals.markFill)
      setColorPair('chart_mark_stroke', vals.markStroke)
      setColorPair('chart_bg_color', vals.background)
      setColorPair('chart_axis_label_color', vals.axisLabel)
      setColorPair('chart_axis_grid_color', vals.axisGrid)
      setColorPair('chart_title_color', vals.titleColor)

      if ($id('chart_color_scheme')) $id('chart_color_scheme').value = vals.colorScheme
      if ($id('chart_show_legend')) $id('chart_show_legend').checked = vals.showLegend
      if ($id('chart_legend_orient')) $id('chart_legend_orient').value = vals.legendOrient

      toggleColorMode(spec)
    }

    const readPanelValues = () => ({
      title: ($id('chart_title')?.value || '').trim(),
      width: Number($id('chart_width')?.value),
      height: Number($id('chart_height')?.value),
      opacity: Number($id('chart_opacity')?.value),
      strokeWidth: Number($id('chart_stroke_width')?.value),
      pointSize: Number($id('chart_point_size')?.value),
      innerRadius: Number($id('chart_inner_radius')?.value),
      padding: Number($id('chart_padding')?.value),
      markFill: $id('chart_mark_fill')?.value || '',
      markStroke: $id('chart_mark_stroke')?.value || '',
      background: $id('chart_bg_color')?.value || '',
      axisLabel: $id('chart_axis_label_color')?.value || '',
      axisGrid: $id('chart_axis_grid_color')?.value || '',
      titleColor: $id('chart_title_color')?.value || '',
      colorScheme: $id('chart_color_scheme')?.value || 'category10',
      showLegend: !!$id('chart_show_legend')?.checked,
      legendOrient: $id('chart_legend_orient')?.value || 'right'
    })

    const readPanelToSpec = () => {
      const spec = readPlotSpec(activeGroup)
      if (!spec) return null

      const tplId = $id('chart_mark_type')?.value || 'bar'
      const cols = specColumnNames(spec)
      let next = tplId === guessTemplateIdFromSpec(spec)
        ? JSON.parse(JSON.stringify(spec))
        : buildTemplateSpec(cols.length ? cols : ['category', 'value'], tplId)
      if (!next.data?.values?.length && spec.data?.values?.length) {
        next.data = { values: spec.data.values }
      }

      const x = $id('chart_x_field')?.value
      const y = $id('chart_y_field')?.value
      const color = $id('chart_color_field')?.value
      const size = $id('chart_size_field')?.value

      if (x && next.encoding?.x) next.encoding.x.field = x
      if (y && next.encoding?.y) next.encoding.y.field = y
      if (color) {
        if (!next.encoding) next.encoding = {}
        next.encoding.color = { field: color, type: 'nominal' }
      } else if (next.encoding?.color?.field) {
        delete next.encoding.color
      }
      if (size) {
        if (!next.encoding) next.encoding = {}
        next.encoding.size = { field: size, type: 'quantitative' }
      } else if (next.encoding?.size?.field) {
        delete next.encoding.size
      }

      next = applyControlValues(next, readPanelValues())
      return next
    }

    const runRerender = async () => {
      if (!activeGroup) return
      if (busy) {
        pendingRerender = true
        return
      }
      const spec = readPanelToSpec()
      if (!spec) return
      busy = true
      setStatus(t(svgEditor, 'updating'))
      try {
        await rerenderChartGroup(svgEditor, activeGroup, spec)
        toggleColorMode(spec)
      } catch (err) {
        console.warn('Chart rerender failed', err)
        setStatus(t(svgEditor, 'updateFailed'))
      } finally {
        busy = false
        if (!pendingRerender) setStatus('')
        if (pendingRerender) {
          pendingRerender = false
          runRerender()
        }
      }
    }

    const scheduleRerender = () => {
      if (!activeGroup) return
      clearTimeout(rerenderTimer)
      rerenderTimer = window.setTimeout(runRerender, 100)
    }

    const schemeOptions = COLOR_SCHEMES.map((s) => `<option value="${s}">${s}</option>`).join('')

    return {
      name: t(svgEditor, 'name'),
      callback () {
        const markOptions = buildMarkTypeSelectHtml()
        const host = $id('right_charts_extensions') || $id('right_properties_extensions')
        if (!host) return

        const wrap = document.createElement('div')
        wrap.id = 'chart_panel_wrap'
        wrap.innerHTML = `
          <p id="chart_panel_hint" class="right_panel_hint">${t(svgEditor, 'panelHint')}</p>
          <div id="chart_panel" class="chart_panel prop-section" style="display:none">
            <div class="prop-header">${t(svgEditor, 'sectionData')}</div>
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
            <label class="ai_field">
              <span>${t(svgEditor, 'sizeField')}</span>
              <select id="chart_size_field"></select>
            </label>

            <div class="prop-header">${t(svgEditor, 'sectionDimensions')}</div>
            <div class="prop-row prop-row-2">
              ${rangeFieldHtml('chart_width', t(svgEditor, 'width'), 120, 1200, 10, 480)}
              ${rangeFieldHtml('chart_height', t(svgEditor, 'height'), 100, 1200, 10, 300)}
            </div>
            ${rangeFieldHtml('chart_padding', t(svgEditor, 'padding'), 0, 80, 2, 20)}

            <div class="prop-header">${t(svgEditor, 'sectionMark')}</div>
            ${rangeFieldHtml('chart_opacity', t(svgEditor, 'opacity'), 0, 1, 0.05, 1)}
            ${rangeFieldHtml('chart_stroke_width', t(svgEditor, 'strokeWidth'), 0, 12, 0.5, 1)}
            ${rangeFieldHtml('chart_point_size', t(svgEditor, 'pointSize'), 10, 600, 5, 80)}
            ${rangeFieldHtml('chart_inner_radius', t(svgEditor, 'innerRadius'), 0, 120, 2, 0)}

            <div class="prop-header">${t(svgEditor, 'sectionColors')}</div>
            <div id="chart_fixed_color_wrap">
              ${colorFieldHtml('chart_mark_fill', t(svgEditor, 'markFill'), '#4c78a8')}
            </div>
            <div id="chart_scheme_wrap" style="display:none">
              <label class="ai_field">
                <span>${t(svgEditor, 'colorScheme')}</span>
                <select id="chart_color_scheme">${schemeOptions}</select>
              </label>
            </div>
            ${colorFieldHtml('chart_mark_stroke', t(svgEditor, 'markStroke'), '#000000')}
            ${colorFieldHtml('chart_bg_color', t(svgEditor, 'background'), '#ffffff')}
            ${colorFieldHtml('chart_axis_label_color', t(svgEditor, 'axisLabelColor'), '#666666')}
            ${colorFieldHtml('chart_axis_grid_color', t(svgEditor, 'axisGridColor'), '#dddddd')}
            ${colorFieldHtml('chart_title_color', t(svgEditor, 'titleColor'), '#333333')}

            <div class="prop-header">${t(svgEditor, 'sectionLegend')}</div>
            <label class="ai_check">
              <input type="checkbox" id="chart_show_legend" checked />
              <span>${t(svgEditor, 'showLegend')}</span>
            </label>
            <label class="ai_field">
              <span>${t(svgEditor, 'legendPosition')}</span>
              <select id="chart_legend_orient">
                <option value="right">right</option>
                <option value="left">left</option>
                <option value="top">top</option>
                <option value="bottom">bottom</option>
                <option value="none">none</option>
              </select>
            </label>

            <div class="ai_row">
              <button type="button" id="chart_apply_btn" class="ai_btn secondary">${t(svgEditor, 'apply')}</button>
              <button type="button" id="chart_ask_ai_btn" class="ai_btn secondary">${t(svgEditor, 'askAi')}</button>
            </div>
            <p id="chart_panel_status" class="chart_panel_status" aria-live="polite"></p>
          </div>
        `
        host.appendChild(wrap)

        const onChange = () => scheduleRerender()

        ;[
          'chart_mark_type', 'chart_x_field', 'chart_y_field',
          'chart_color_field', 'chart_size_field', 'chart_color_scheme',
          'chart_legend_orient'
        ].forEach((id) => {
          $id(id)?.addEventListener('change', () => {
            if (id === 'chart_color_field') {
              const spec = readPanelToSpec()
              if (spec) toggleColorMode(spec)
            }
            onChange()
          })
        })

        ;['chart_title', 'chart_show_legend'].forEach((id) => {
          const el = $id(id)
          el?.addEventListener('input', onChange)
          el?.addEventListener('change', onChange)
        })

        bindRangeNumber($id('chart_width_range'), $id('chart_width'), onChange)
        bindRangeNumber($id('chart_height_range'), $id('chart_height'), onChange)
        bindRangeNumber($id('chart_padding_range'), $id('chart_padding'), onChange)
        bindRangeNumber($id('chart_opacity_range'), $id('chart_opacity'), onChange)
        bindRangeNumber($id('chart_stroke_width_range'), $id('chart_stroke_width'), onChange)
        bindRangeNumber($id('chart_point_size_range'), $id('chart_point_size'), onChange)
        bindRangeNumber($id('chart_inner_radius_range'), $id('chart_inner_radius'), onChange)

        bindColorPair($id('chart_mark_fill_picker'), $id('chart_mark_fill'), onChange)
        bindColorPair($id('chart_mark_stroke_picker'), $id('chart_mark_stroke'), onChange)
        bindColorPair($id('chart_bg_color_picker'), $id('chart_bg_color'), onChange)
        bindColorPair($id('chart_axis_label_color_picker'), $id('chart_axis_label_color'), onChange)
        bindColorPair($id('chart_axis_grid_color_picker'), $id('chart_axis_grid_color'), onChange)
        bindColorPair($id('chart_title_color_picker'), $id('chart_title_color'), onChange)

        $id('chart_apply_btn')?.addEventListener('click', onChange)
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
        svgEditor.rightPanel?.switchTab?.('charts')
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
