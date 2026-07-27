export default {
  name: 'Pathfinder',
  panel_label: 'Pathfinder',
  union: 'Union',
  union_title: 'Union — combine selected shapes into one outline',
  subtract: 'Minus Front',
  subtract_title: 'Minus Front — subtract the frontmost shape from those behind it',
  intersect: 'Intersect',
  intersect_title: 'Intersect — keep only the overlapping area',
  exclude: 'Exclude',
  exclude_title: 'Exclude — keep non-overlapping areas (XOR)',
  need_two_shapes: 'Select at least two shapes to use Pathfinder.',
  unsupported: 'Pathfinder works on paths, rectangles, ellipses, lines, and polygons (not text or images).',
  failed: 'Could not compute Pathfinder result for the selected shapes.'
}
