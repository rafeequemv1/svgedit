import { t } from '../locale.js'

const template = document.createElement('template')
template.innerHTML = `
  <style>
  .row {
    display: flex;
    flex-direction: column;
    width: 100%;
    margin: 4px 0;
    gap: 3px;
  }
  .header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    color: #fff;
    font-size: 8pt;
    line-height: 1.2;
  }
  #value {
    color: var(--orange-color);
    font-weight: bold;
    min-width: 3.25em;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  input[type="range"] {
    width: 100%;
    margin: 0;
    accent-color: var(--orange-color);
    cursor: pointer;
  }
  </style>
  <div class="row" part="row">
    <div class="header">
      <span id="label"></span>
      <span id="value"></span>
    </div>
    <input type="range" id="range" />
  </div>
`

/**
 * Horizontal slider with label and live value readout.
 */
export class SERangeInput extends HTMLElement {
  constructor () {
    super()
    this._shadowRoot = this.attachShadow({ mode: 'open' })
    this._shadowRoot.append(template.content.cloneNode(true))
    this.$row = this._shadowRoot.querySelector('.row')
    this.$label = this._shadowRoot.getElementById('label')
    this.$value = this._shadowRoot.getElementById('value')
    this.$range = this._shadowRoot.getElementById('range')
    this._decimals = 0
  }

  static get observedAttributes () {
    return ['value', 'label', 'min', 'max', 'step', 'title', 'decimals']
  }

  attributeChangedCallback (name, oldValue, newValue) {
    if (oldValue === newValue) return
    switch (name) {
      case 'title':
        this.$row.setAttribute('title', t(newValue))
        break
      case 'label':
        this.$label.textContent = t(newValue)
        break
      case 'min':
      case 'max':
      case 'step':
        this.$range.setAttribute(name, newValue)
        break
      case 'decimals':
        this._decimals = Number(newValue) || 0
        this.updateValueDisplay()
        break
      case 'value':
        this.$range.value = newValue
        this.updateValueDisplay()
        break
      default:
        break
    }
  }

  updateValueDisplay () {
    const n = Number(this.$range.value)
    this.$value.textContent = Number.isFinite(n)
      ? n.toFixed(this._decimals)
      : this.$range.value
  }

  get value () {
    return this.$range.value
  }

  set value (val) {
    this.$range.value = val
    this.updateValueDisplay()
  }

  connectedCallback () {
    if (this._bound) return
    this._bound = true
    this._onInput = () => {
      this.updateValueDisplay()
      this.dispatchEvent(new Event('input', { bubbles: true }))
    }
    this._onChange = () => {
      this.updateValueDisplay()
      this.dispatchEvent(new Event('change', { bubbles: true }))
    }
    this.$range.addEventListener('input', this._onInput)
    this.$range.addEventListener('change', this._onChange)
    this.updateValueDisplay()
  }

  disconnectedCallback () {
    if (!this._bound) return
    this.$range.removeEventListener('input', this._onInput)
    this.$range.removeEventListener('change', this._onChange)
    this._bound = false
  }
}

customElements.define('se-range-input', SERangeInput)
