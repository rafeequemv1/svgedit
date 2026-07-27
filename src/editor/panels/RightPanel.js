import SvgCanvas from '@svgedit/svgcanvas'
import RightPanelHtml from './RightPanel.html'

const { $click, $id } = SvgCanvas

/**
 * Right-side tabbed panel (Properties, Align, Layers).
 */
class RightPanel {
  /**
   * @param {PlainObject} editor
   */
  constructor (editor) {
    this.editor = editor
    this.activeTab = 'properties'
  }

  /**
   * @returns {void}
   */
  init () {
    const template = document.createElement('template')
    template.innerHTML = RightPanelHtml
    this.editor.$svgEditor.append(template.content.cloneNode(true))

    const { i18next } = this.editor
    $id('tab_btn_properties').textContent = i18next.t('ui.tab_properties')
    $id('tab_btn_align').textContent = i18next.t('ui.tab_align')
    $id('tab_btn_layers').textContent = i18next.t('ui.tab_layers')
    const alignHint = $id('align_hint')
    if (alignHint) {
      alignHint.textContent = i18next.t('ui.align_hint')
    }

    const sectionKeys = {
      actions: 'ui.prop_section_actions',
      transform: 'ui.prop_section_transform',
      appearance: 'ui.prop_section_appearance',
      character: 'ui.prop_section_character',
      paragraph: 'ui.prop_section_paragraph',
      spacing: 'ui.prop_section_spacing',
      style: 'ui.prop_section_style',
      path: 'ui.prop_section_path',
      group: 'ui.prop_section_group',
      link: 'ui.prop_section_link',
      identity: 'ui.prop_section_identity',
      image: 'ui.prop_section_image',
      line: 'ui.prop_section_line',
      pencil: 'ui.prop_section_pencil',
      align: 'ui.prop_section_align'
    }
    document.querySelectorAll('[data-prop-section]').forEach((el) => {
      const key = sectionKeys[el.getAttribute('data-prop-section')]
      if (key) el.textContent = i18next.t(key)
    })
    const textArea = $id('text')
    if (textArea) {
      textArea.placeholder = i18next.t('ui.prop_text_placeholder')
    }

    document.querySelectorAll('.right_tab_btn').forEach(btn => {
      $click(btn, () => this.switchTab(btn.dataset.tab))
    })
    this.switchTab('properties')

    this.#initPencilSmoothing()
  }

  /**
   * Pencil freehand smoothing slider (Paper.js simplify strength).
   * @returns {void}
   * @private
   */
  #initPencilSmoothing () {
    const slider = $id('freehand_smoothing')
    if (!slider) return

    const apply = (raw) => {
      const n = Math.max(0, Math.min(100, Number(raw)))
      const val = Number.isFinite(n) ? n : 50
      this.editor.configObj.curConfig.freehandSmoothing = val
      this.editor.svgCanvas.setConfig({ freehandSmoothing: val })
      return val
    }

    const initial = this.editor.configObj.curConfig.freehandSmoothing ?? 50
    slider.value = String(apply(initial))

    const onSlide = () => apply(slider.value)
    slider.addEventListener('input', onSlide)
    slider.addEventListener('change', onSlide)

    document.addEventListener('modeChange', () => this.updatePencilPanel())
    this.updatePencilPanel()
  }

  /**
   * Show pencil options when the freehand (pencil) tool is active.
   * @returns {void}
   */
  updatePencilPanel () {
    const panel = $id('pencil_panel')
    if (!panel) return
    const mode = this.editor.svgCanvas.getMode()
    if (mode === 'fhpath') {
      panel.style.removeProperty('display')
    } else {
      panel.style.display = 'none'
    }
  }

  /**
   * @param {string} tabId
   * @returns {void}
   */
  switchTab (tabId) {
    this.activeTab = tabId
    document.querySelectorAll('.right_tab_btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId)
    })
    document.querySelectorAll('.right_tab_panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === `tab_${tabId}`)
    })
  }
}

export default RightPanel
