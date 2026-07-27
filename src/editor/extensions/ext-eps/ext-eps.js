/* globals seAlert */
/**
 * @file ext-eps.js
 * Import and export Encapsulated PostScript (EPS) files.
 * @license MIT
 */

import { fileSave } from 'browser-fs-access'
import { svgToEps } from './svg-to-eps.js'
import { epsToSvg, epsBytesToSvg, isEpsFile, isSupportedEpsBytes, isPlaceholderSvg } from './eps-to-svg.js'

const name = 'eps'

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

export default {
  name,
  async init () {
    const svgEditor = this
    const { svgCanvas } = svgEditor

    await loadExtensionTranslation(svgEditor)

    /**
     * @returns {Promise<void>}
     */
    svgEditor.exportEPS = async () => {
      svgCanvas.clearSelection()
      const svg = svgCanvas.svgCanvasToString()
      const res = svgCanvas.getResolution()
      const eps = svgToEps(svg, res)
      const blob = new Blob([eps], { type: 'application/postscript' })
      await fileSave(blob, {
        fileName: (svgEditor.title || 'untitled').replace(/\.svg$/i, '') + '.eps',
        extensions: ['.eps']
      })
    }

    /**
     * @param {string} epsText
     * @returns {Promise<void>}
     */
    svgEditor.loadEpsString = async (epsText) => {
      const svg = epsToSvg(epsText)
      await svgEditor.loadSvgString(svg)
    }

    /**
     * @param {File|Blob} file
     * @returns {Promise<void>}
     */
    svgEditor.importEpsFile = async (file) => {
      const bytes = new Uint8Array(await file.arrayBuffer())
      if (!isSupportedEpsBytes(bytes)) {
        throw new Error('Unrecognized EPS format — try exporting as SVG from the source app')
      }

      const { epsBytesToFullSvg } = await import('./eps-full-import.js')
      try {
        const fullSvg = await epsBytesToFullSvg(bytes)
        svgEditor.loadSvgString(fullSvg)
        return
      } catch (err) {
        console.warn('Full EPS conversion failed, trying preview fallback:', err)
      }

      const svg = epsBytesToSvg(bytes)
      if (isPlaceholderSvg(svg)) {
        throw new Error(
          'Could not convert this Illustrator EPS — artwork may use Adobe-only encoding. ' +
          'Re-export as SVG from Illustrator, or save with "Create PDF Compatible File" checked.'
        )
      }
      svgEditor.loadSvgString(svg)
    }

    return {
      name: svgEditor.i18next.t(`${name}:name`),
      callback () {
        const { $id, $click } = svgCanvas
        const { i18next } = svgEditor

        const exportSelect = document
          .getElementById('se-export-dialog')
          ?.shadowRoot
          ?.querySelector('#se-storage-pref')
        if (exportSelect) {
          exportSelect.setAttribute('options', 'PNG,JPEG,BMP,WEBP,PDF,EPS')
          exportSelect.setAttribute('values', 'PNG::JPEG::BMP::WEBP::PDF::EPS')
        }

        const openEpsInput = document.createElement('input')
        openEpsInput.type = 'file'
        openEpsInput.accept = '.eps,application/postscript,application/eps'
        openEpsInput.style.display = 'none'
        svgEditor.$container.append(openEpsInput)

        const importEpsInput = document.createElement('input')
        importEpsInput.type = 'file'
        importEpsInput.accept = '.eps,application/postscript,application/eps'
        importEpsInput.style.display = 'none'
        svgEditor.$container.append(importEpsInput)

        openEpsInput.addEventListener('change', () => {
          const file = openEpsInput.files?.[0]
          openEpsInput.value = ''
          if (!file) return
          svgCanvas.runExtensions('openFile', { file, action: 'open' })
        })

        importEpsInput.addEventListener('change', () => {
          const file = importEpsInput.files?.[0]
          importEpsInput.value = ''
          if (!file) return
          svgCanvas.runExtensions('openFile', { file, action: 'import' })
        })

        const mainButton = $id('main_button')
        if (mainButton) {
          svgCanvas.insertChildAtIndex(mainButton, `
            <se-menu-item id="tool_open_eps" label="eps:open_eps" src="open.svg"></se-menu-item>
          `, 2)
          svgCanvas.insertChildAtIndex(mainButton, `
            <se-menu-item id="tool_import_eps" label="eps:import_eps" src="importImg.svg"></se-menu-item>
          `, 6)
          $click($id('tool_open_eps'), () => openEpsInput.click())
          $click($id('tool_import_eps'), () => importEpsInput.click())
        }

        // Refresh opensave menu labels now that EPS bundle is loaded
        const openItem = $id('tool_open')
        const importItem = $id('tool_import')
        if (openItem?.setAttribute) {
          openItem.setAttribute('label', 'opensave.open_image_doc')
        }
        if (importItem?.setAttribute) {
          importItem.setAttribute('label', 'tools.import_doc')
        }
      },
      /**
       * Hook used by ext-opensave when opening/importing files.
       * @param {{file: File, action: 'open'|'import', shiftKey?: boolean}} opts
       * @returns {boolean|undefined} true if handled
       */
      openFile (opts) {
        if (!opts?.file || !isEpsFile(opts.file)) return undefined
        const { $id } = svgCanvas
        const prompt = $id('se-prompt-dialog')
        const showLoading = () => {
          prompt.title = svgEditor.i18next.t('notification.loadingImage') +
            (opts.file?.name?.endsWith('.eps') ? ' (converting EPS — may take a moment)' : '')
          prompt.close = false
        }
        const hideLoading = () => {
          prompt.close = true
        }

        const run = async () => {
          try {
            if (opts.action === 'open' && !opts.prepared) {
              const response = await svgEditor.openPrep()
              if (response === 'Cancel') return
              svgCanvas.clear()
            }
            showLoading()
            await svgEditor.importEpsFile(opts.file)
            svgEditor.updateCanvas()
            svgEditor.zoomImage()
            if (opts.action === 'open') {
              svgEditor.topPanel.updateTitle(opts.file.name)
              svgEditor.layersPanel.populateLayers()
              svgCanvas.runExtensions('onOpenedDocument', {
                name: opts.file.name,
                lastModified: opts.file.lastModified,
                size: opts.file.size,
                type: opts.file.type
              })
            } else {
              svgCanvas.alignSelectedElements('m', 'page')
              svgCanvas.alignSelectedElements('c', 'page')
            }
          } catch (err) {
            console.error(err)
            seAlert(
              svgEditor.i18next.t('notification.errorLoadingSVG') +
              (err?.message ? `\n${err.message}` : '')
            )
          } finally {
            hideLoading()
          }
        }
        run()
        return true
      }
    }
  }
}
