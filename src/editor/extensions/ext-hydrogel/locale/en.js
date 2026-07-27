export default {
  name: 'Hydrogel',
  title: 'Hydrogel Tool',
  panelTitle: 'Hydrogel',
  buttons: [
    {
      title: 'Hydrogel Tool (drag a region)'
    }
  ],
  contextTools: [
    { title: 'Outer shape of the hydrogel region', label: 'Shape' },
    { title: 'Polymer network type', label: 'Network' },
    { title: 'Number of polymer chains', label: 'Density' },
    { title: 'Segments per polymer chain', label: 'Chain Length' },
    { title: 'Pore diameter used for packing gaps', label: 'Pore Size' },
    { title: 'Amount of cross-link junctions', label: 'Cross-link Density' },
    { title: 'Cross-linker node radius', label: 'Cross-linker Size' },
    { title: 'Cross-linker color', label: 'Cross-linker Color' },
    { title: 'Polymer stroke thickness', label: 'Thickness' },
    { title: 'Polymer chain color', label: 'Polymer Color' },
    { title: 'Show encapsulated particles', label: 'Show Particles' },
    { title: 'Number of encapsulated particles', label: 'Particle Count' },
    { title: 'Particle radius', label: 'Particle Radius' },
    { title: 'Particle color', label: 'Particle Color' },
    { title: 'Swelling (50 = default size)', label: 'Swelling' },
    { title: 'Fraction of particles released outside', label: 'Payload Release' }
  ]
}
