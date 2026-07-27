import SvgCanvas from '@svgedit/svgcanvas'
import RightPanelHtml from './RightPanel.html'

const { $click, $id } = SvgCanvas

const LS_COLLAPSED = 'svgedit.sidepanel.collapsed'

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
    this.collapsed = false
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
    $id('tab_btn_charts').textContent = i18next.t('ui.tab_charts')
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

    this.#initDock()
    this.#initPencilSmoothing()
  }

  /**
   * Minimize / expand the properties dock.
   * @returns {void}
   * @private
   */
  #initDock () {
    const btn = $id('sidepanel_dock_btn')
    if (!btn) return

    const saved = localStorage.getItem(LS_COLLAPSED) === '1'
    this.setCollapsed(saved)

    $click(btn, () => {
      this.setCollapsed(!this.collapsed)
    })

    // When AI chat opens on a narrow layout, auto-dock properties once (still toggleable).
    document.addEventListener('modeChange', () => { /* keep hook for future */ })
    const root = document.querySelector('.svg_editor')
    if (root && typeof MutationObserver !== 'undefined') {
      const obs = new MutationObserver(() => {
        if (root.classList.contains('ai-chat-open') && !this._aiAutoDocked) {
          if (!this.collapsed && window.innerWidth < 1280) {
            this.setCollapsed(true)
            this._aiAutoDocked = true
          }
        }
        if (!root.classList.contains('ai-chat-open')) {
          this._aiAutoDocked = false
        }
      })
      obs.observe(root, { attributes: true, attributeFilter: ['class'] })
    }
  }

  /**
   * @param {boolean} collapsed
   * @returns {void}
   */
  setCollapsed (collapsed) {
    this.collapsed = !!collapsed
    const root = document.querySelector('.svg_editor')
    const btn = $id('sidepanel_dock_btn')
    const { i18next } = this.editor
    root?.classList.toggle('sidepanel-collapsed', this.collapsed)
    localStorage.setItem(LS_COLLAPSED, this.collapsed ? '1' : '0')

    if (btn) {
      if (this.collapsed) {
        btn.textContent = i18next.t('ui.dock_rail_label')
        btn.title = i18next.t('ui.undock_properties')
        btn.setAttribute('aria-label', i18next.t('ui.undock_properties'))
        btn.setAttribute('aria-expanded', 'false')
      } else {
        btn.textContent = '‹'
        btn.title = i18next.t('ui.dock_properties')
        btn.setAttribute('aria-label', i18next.t('ui.dock_properties'))
        btn.setAttribute('aria-expanded', 'true')
      }
    }

    try {
      this.editor.updateCanvas?.(false)
    } catch (_) { /* ignore */ }
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
    if (this.collapsed) {
      this.setCollapsed(false)
    }
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
