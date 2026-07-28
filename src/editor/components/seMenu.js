/* globals svgEditor */
import 'elix/define/MenuItem.js'
import './sePlainMenuButton.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  :host {
    padding: 0;
    display: inline-flex;
    align-items: center;
    height: 28px;
  }
  elix-menu-button {
    height: 28px;
  }
  elix-menu-button::part(menu) {
    background-color: #2c2c2c !important;
    color: #f3f3f3;
    border: 1px solid rgba(255, 255, 255, 0.12) !important;
    border-radius: 6px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    padding: 4px 0;
    min-width: 180px;
  }
  elix-menu-button::part(popup-toggle) {
    padding: 0.2em 0.55em !important;
    background: transparent !important;
    border: none !important;
    color: rgba(255, 255, 255, 0.88) !important;
    font-family: system-ui, -apple-system, "Segoe UI", sans-serif !important;
    font-size: 12px !important;
    font-weight: 500 !important;
    letter-spacing: 0.01em;
    border-radius: 4px;
  }
  elix-menu-button::part(popup-toggle):hover {
    background: rgba(255, 255, 255, 0.08) !important;
  }
  :host ::slotted([current]){
    background-color: var(--icon-bg-color-hover) !important;
    color: #fff;
  }
  :host ::slotted(*){
    padding: 0.35em 1.1em 0.35em 0.65em !important;
    margin: 0;
    border-radius: 0;
  }
  </style>

  <elix-menu-button id="MenuButton" aria-label="File">
    <slot></slot>
  </elix-menu-button>

`
/**
 * @class SeMenu
 */
export class SeMenu extends HTMLElement {
  /**
    * @function constructor
    */
  constructor () {
    super()
    // create the shadowDom and insert the template
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$menu = this._shadowRoot.querySelector('elix-menu-button')
    this.$label = this.$menu.shadowRoot.querySelector('#popupToggle').shadowRoot
    this.imgPath = svgEditor.configObj.curConfig.imgPath
  }

  /**
   * @function observedAttributes
   * @returns {any} observed
   */
  static get observedAttributes () {
    return ['label', 'src']
  }

  /**
   * @function attributeChangedCallback
   * @param {string} name
   * @param {string} oldValue
   * @param {string} newValue
   * @returns {void}
   */
  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'src':
        if (!newValue) break
        {
          const image = new Image()
          image.src = this.imgPath + '/' + newValue
          image.width = 18
          image.height = 18
          image.alt = ''
          this.$label.prepend(image)
        }
        break
      case 'label':
        this.$label.prepend(document.createTextNode(newValue))
        break
      default:
        console.error(`unknown attribute: ${name}`)
        break
    }
  }

  /**
   * @function get
   * @returns {any}
   */
  get label () {
    return this.getAttribute('label')
  }

  /**
   * @function set
   * @returns {void}
   */
  set label (value) {
    this.setAttribute('label', value)
  }

  /**
   * @function get
   * @returns {any}
   */
  get src () {
    return this.getAttribute('src')
  }

  /**
   * @function set
   * @returns {void}
   */
  set src (value) {
    this.setAttribute('src', value)
  }
}

// Register
customElements.define('se-menu', SeMenu)
