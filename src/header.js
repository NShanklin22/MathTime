// The header (spec §3.1).

// Drop breadcrumb parts from the left until the header fits on one line.
export function fitHeader(topBar) {
  topBar.classList.remove('tight', 'tighter');
  const where = topBar.querySelector('.where');
  const crumbs = topBar.querySelector('.crumbs');
  if (crumbs.scrollWidth > where.clientWidth) topBar.classList.add('tight');
  if (crumbs.scrollWidth > where.clientWidth) topBar.classList.add('tighter');
}
