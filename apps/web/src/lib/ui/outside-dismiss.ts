/** Consume the entire outside gesture; dismiss only after the click completes. */
export function outsideDismiss(contains: (target: Node) => boolean, close: () => void) {
  const outside = (event: Event) => event.target instanceof Node && !contains(event.target)
  const block = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation() }
  const press = (event: Event) => { if (outside(event)) block(event) }
  const click = (event: Event) => { if (outside(event)) { block(event); close() } }
  document.addEventListener('pointerdown', press, true)
  document.addEventListener('mousedown', press, true)
  document.addEventListener('click', click, true)
  return () => {
    document.removeEventListener('pointerdown', press, true)
    document.removeEventListener('mousedown', press, true)
    document.removeEventListener('click', click, true)
  }
}
