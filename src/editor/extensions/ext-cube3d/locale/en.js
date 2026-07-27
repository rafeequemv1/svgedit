export default {
  name: '3D Cube',
  title: '3D Cube Tool',
  panelTitle: '3D Cube',
  buttons: [
    {
      title: '3D Cube Tool'
    }
  ],
  contextTools: [
    { title: 'Rotate around X axis', label: 'Rot X' },
    { title: 'Rotate around Y axis', label: 'Rot Y' },
    { title: 'Rotate around Z axis', label: 'Rot Z' },
    { title: 'Scale on X axis', label: 'Scale X' },
    { title: 'Scale on Y axis', label: 'Scale Y' },
    { title: 'Scale on Z axis', label: 'Scale Z' },
    { title: 'Cube size in SVG units', label: 'Size' },
    { title: 'Perspective strength (0 = isometric, 100 = strong)', label: 'Perspective' }
  ]
}
