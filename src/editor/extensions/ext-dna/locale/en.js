export default {
  name: 'DNA Helix',
  title: 'DNA Helix Brush',
  panelTitle: 'DNA brush',
  buttons: [
    { title: 'DNA Helix — draw a freehand path' }
  ],
  contextTools: [
    { title: 'Cartoon ribbons or molecular atoms', label: 'Style' },
    { title: 'Helix thickness (scales radius & spacing)', label: 'Thickness' },
    { title: 'Backbone strand color', label: 'Strand color' },
    { title: 'Base-pair rung color', label: 'Base-pair color' },
    { title: 'Mono color or alternating A-T / G-C', label: 'Base-pair mode' },
    { title: 'Draw base-pair rungs', label: 'Show base pairs' },
    { title: 'Only one backbone strand', label: 'Single strand' },
    { title: "Show 5′ / 3′ polarity markers", label: "5′ / 3′ polarity" },
    { title: 'Nucleosome histone wraps along path', label: 'Show histones' },
    { title: 'Base pairs between histone wraps', label: 'Histone spacing' },
    { title: 'Number sequence ticks along the helix', label: 'Sequence labels' }
  ],
  spineHint: 'Double-click the helix to edit the centerline (Bézier nodes).'
}
