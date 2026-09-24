// Supplied SVG artwork is external so its embedded raster payload is cached once.
export function Crown({ small = false }: { small?: boolean }) {
  return <img className={small ? 'crown-small' : 'glass-crown'} src="/brand/crown.svg" width="182" height="150" alt="usurp iridescent glass crown" decoding="async" fetchPriority="high"/>;
}
