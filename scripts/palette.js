const ROUTE_COLORS = [
  "#1a73e8",
  "#ff7043",
  "#34a853",
  "#ab47bc",
  "#fbbc04",
  "#00acc1",
];

export function routeColorAt(index) {
  if (index < 0) return ROUTE_COLORS[0];
  return ROUTE_COLORS[index % ROUTE_COLORS.length];
}

export function getRouteColors(count) {
  return Array.from({ length: count }, (_, index) => routeColorAt(index));
}
