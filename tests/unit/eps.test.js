import { describe, expect, it } from 'vitest'
import { svgToEps, parseColor } from '../../src/editor/extensions/ext-eps/svg-to-eps.js'
import { epsToSvg, epsBytesToSvg, parseBoundingBox, isEpsFileName, isLikelyTextEps, isSupportedEpsBytes, findPostScriptOffset, parseDosEpsHeader } from '../../src/editor/extensions/ext-eps/eps-to-svg.js'

describe('eps support', () => {
  it('parses colors', () => {
    expect(parseColor('#ff0000')).toEqual([1, 0, 0])
    expect(parseColor('none')).toBeNull()
  })

  it('exports a simple rectangle to EPS', () => {
    const eps = svgToEps(
      '<svg width="100" height="50"><rect x="10" y="10" width="30" height="20" fill="#ff0000"/></svg>',
      { w: 100, h: 50 }
    )
    expect(eps).toContain('%!PS-Adobe-3.0 EPSF-3.0')
    expect(eps).toContain('%%BoundingBox: 0 0 100 50')
    expect(eps).toContain('rect')
    expect(eps).toContain('fill')
  })

  it('imports embedded SVG from EPS', () => {
    const eps = [
      '%!PS-Adobe-3.0 EPSF-3.0',
      '%%BoundingBox: 0 0 100 100',
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="10"/></svg>',
      '%%EOF'
    ].join('\n')
    const svg = epsToSvg(eps)
    expect(svg).toContain('<circle')
  })

  it('parses bounding box and basic path operators', () => {
    const eps = [
      '%!PS-Adobe-3.0 EPSF-3.0',
      '%%BoundingBox: 0 0 200 100',
      '10 10 moveto 90 10 lineto stroke',
      '%%EOF'
    ].join('\n')
    expect(parseBoundingBox(eps)).toEqual({ x: 0, y: 0, width: 200, height: 100 })
    const svg = epsToSvg(eps)
    expect(svg).toContain('<path')
    expect(svg).toContain('viewBox="0 0 200 100"')
  })

  it('detects eps filenames', () => {
    expect(isEpsFileName('membrane.eps')).toBe(true)
    expect(isEpsFileName('file.svg')).toBe(false)
  })

  it('detects text-based EPS headers', () => {
    expect(isLikelyTextEps('%!PS-Adobe-3.0 EPSF-3.0')).toBe(true)
    expect(isLikelyTextEps('not eps')).toBe(false)
  })

  it('finds PostScript header after binary prefix', () => {
    const header = new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 100 50\n10 10 moveto 90 10 lineto stroke\n%%EOF')
    const bytes = new Uint8Array(header.length + 4)
    bytes.set([0, 0, 0, 0], 0)
    bytes.set(header, 4)
    expect(findPostScriptOffset(bytes)).toBe(4)
    const svg = epsBytesToSvg(bytes)
    expect(svg).toContain('<path')
  })

  it('imports JPEG preview when vector data is unavailable', () => {
    // Minimal JPEG structure: SOI + dummy + EOI
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0xFF, 0xD9])
    const ps = new TextEncoder().encode('%!PS-Adobe-3.0 EPSF-3.0\n%%BoundingBox: 0 0 120 80\n%%EOF\n')
    const bytes = new Uint8Array(jpeg.length + ps.length)
    bytes.set(jpeg, 0)
    bytes.set(ps, jpeg.length)
    const svg = epsBytesToSvg(bytes)
    expect(svg).toContain('<image')
    expect(svg).toContain('data:image/jpeg;base64,')
  })

  it('supports eps bytes with embedded preview only signature', () => {
    const jpeg = new Uint8Array([0xFF, 0xD8, 0xFF, 0xDB, 0x00, 0x43, 0x00, 0xFF, 0xD9])
    expect(isSupportedEpsBytes(jpeg)).toBe(true)
  })

  it('parses DOS EPS header offsets', () => {
    const bytes = new Uint8Array(40)
    bytes.set([0xC5, 0xD0, 0xD3, 0xC6], 0)
    bytes[4] = 32
    bytes[20] = 100
    bytes[24] = 50
    expect(parseDosEpsHeader(bytes)).toEqual({
      psOffset: 32,
      psLength: 0,
      wmfOffset: 0,
      wmfLength: 0,
      tiffOffset: 100,
      tiffLength: 50
    })
  })
})
