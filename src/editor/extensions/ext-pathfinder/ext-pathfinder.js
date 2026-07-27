/**
 * @file ext-pathfinder.js
 * Illustrator-style Pathfinder: Union, Minus Front, Intersect, Exclude.
 * @license MIT
 */
/* globals seAlert */

import {
  booleanElements,
  collectShapeElements,
  isPathfinderShape
} from './path-boolean.js'

const name = 'pathfinder'

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

/**
 * @param {Element} elem
 * @returns {Record<string, string>}
 */
const styleFromElement = (elem) => {
  const keys = [
    'fill', 'fill-opacity', 'fill-rule',
    'stroke', 'stroke-width', 'stroke-opacity',
    'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray',
    'opacity', 'style'
  ]
  const attr = {}
  keys.forEach((key) => {
    const val = elem.getAttribute(key)
    if (val !== null && val !== undefined && val !== '') {
      attr[key] = val
    }
  })
  return attr
}

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor
    const { BatchCommand, InsertElementCommand, RemoveElementCommand } = svgCanvas.history
    const addToHistory = (cmd) => { svgCanvas.undoMgr.addCommandToHistory(cmd) }
    const { $id, $click } = svgCanvas

    await loadExtensionTranslation(svgEditor)

    const showPanel = (on) => {
      const panel = $id('pathfinder_panel')
      if (!panel) return
      if (on) {
        panel.style.removeProperty('display')
      } else {
        panel.style.display = 'none'
      }
    }

    /**
     * @param {'union'|'subtract'|'intersect'|'exclude'} op
     * @returns {void}
     */
    const runPathfinder = (op) => {
      const selected = svgCanvas.getSelectedElements().filter(Boolean)
      if (selected.length < 2) {
        seAlert(svgEditor.i18next.t(`${name}:need_two_shapes`))
        return
      }
      if (!selected.every(isPathfinderShape)) {
        seAlert(svgEditor.i18next.t(`${name}:unsupported`))
        return
      }

      const shapes = []
      selected.forEach((el) => collectShapeElements(el, shapes))
      if (shapes.length < 2) {
        seAlert(svgEditor.i18next.t(`${name}:need_two_shapes`))
        return
      }

      const d = booleanElements(shapes, op)
      if (!d) {
        seAlert(svgEditor.i18next.t(`${name}:failed`))
        return
      }

      // Style from backmost shape (document order).
      const styleRef = shapes.slice().sort((a, b) => {
        const pos = a.compareDocumentPosition(b)
        if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1
        if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1
        return 0
      })[0]

      const parent = styleRef.parentNode
      const toRemove = [...new Set(shapes)]
      const removals = toRemove.map((elem) => ({
        elem,
        parent: elem.parentNode,
        nextSibling: elem.nextSibling
      }))
      const insertBefore = styleRef

      const fillRule = (op === 'subtract' || op === 'exclude') ? 'evenodd' : 'nonzero'
      const labels = {
        union: 'Pathfinder Union',
        subtract: 'Pathfinder Minus Front',
        intersect: 'Pathfinder Intersect',
        exclude: 'Pathfinder Exclude'
      }

      const newPath = svgCanvas.addSVGElementsFromJson({
        element: 'path',
        attr: {
          id: svgCanvas.getNextId(),
          d,
          'fill-rule': fillRule,
          ...styleFromElement(styleRef)
        }
      })

      if (parent && insertBefore?.parentNode === parent) {
        parent.insertBefore(newPath, insertBefore)
      } else if (parent) {
        parent.append(newPath)
      }

      const batchCmd = new BatchCommand(labels[op] || 'Pathfinder')
      removals.forEach(({ elem, parent: p, nextSibling }) => {
        batchCmd.addSubCommand(new RemoveElementCommand(elem, nextSibling, p))
        elem.remove()
      })
      batchCmd.addSubCommand(new InsertElementCommand(newPath))

      svgCanvas.clearSelection()
      svgCanvas.addToSelection([newPath], true)
      addToHistory(batchCmd)
      svgCanvas.call('changed', [newPath])
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const panelTemplate = document.createElement('template')
        panelTemplate.innerHTML = `
          <div id="pathfinder_panel" class="pathfinder_panel right_panel_section" style="display:none">
            <div class="extension_panel_heading">${svgEditor.i18next.t(`${name}:panel_label`)}</div>
            <div class="pathfinder_tools">
              <se-button id="tool_pathfinder_union" title="${name}:union_title" src="pathfinder_union.svg"></se-button>
              <se-button id="tool_pathfinder_subtract" title="${name}:subtract_title" src="pathfinder_subtract.svg"></se-button>
              <se-button id="tool_pathfinder_intersect" title="${name}:intersect_title" src="pathfinder_intersect.svg"></se-button>
              <se-button id="tool_pathfinder_exclude" title="${name}:exclude_title" src="pathfinder_exclude.svg"></se-button>
            </div>
          </div>
        `
        $id('right_align_extensions').appendChild(panelTemplate.content.cloneNode(true))
        $click($id('tool_pathfinder_union'), () => runPathfinder('union'))
        $click($id('tool_pathfinder_subtract'), () => runPathfinder('subtract'))
        $click($id('tool_pathfinder_intersect'), () => runPathfinder('intersect'))
        $click($id('tool_pathfinder_exclude'), () => runPathfinder('exclude'))
      },
      selectedChanged (opts) {
        const elems = opts.elems?.filter(Boolean) || []
        const count = elems.length
        const ok = count >= 2 && elems.every(isPathfinderShape)
        showPanel(ok)
      }
    }
  }
}
