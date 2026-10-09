import type { Graph, GraphEdge, GraphNode, Point, Room } from '../types';

export function parseRoomId(input: string): string | null {
  const value = input.trim().toUpperCase().replace(/\s+/g, '');
  return /^[1-6](?:F)?-\d{3}[A-Z]?$/.test(value) ? value : null;
}

export function searchRooms(rooms: Room[], query: string, limit = 12): Room[] {
  const q = query.trim().toUpperCase();
  if (!q) return [];
  return rooms.filter(r => r.id.toUpperCase().includes(q) || r.name.toUpperCase().includes(q)).slice(0, limit);
}

export function toSvgPoint(point: Point): Point { return { x: point.x * 1000, y: point.y * 1000 }; }
export function fromSvgPoint(point: Point): Point { return { x: point.x / 1000, y: point.y / 1000 }; }
export function floorAt(index: number, count = 6): number { return Math.min(count, Math.max(1, index)); }

export type Route = { nodes: GraphNode[]; edges: GraphEdge[]; totalDistance?: number };

export function shortestPath(graph: Graph, from: string, to: string): Route | null {
  const verifiedNodes = new Map(graph.nodes.filter(n => n.verified).map(n => [n.id, n]));
  if (!verifiedNodes.has(from) || !verifiedNodes.has(to)) return null;
  const edges = graph.edges.filter(e => e.verified && verifiedNodes.has(e.from) && verifiedNodes.has(e.to) && (e.distance === undefined || (Number.isFinite(e.distance) && e.distance >= 0)));
  const dist = new Map<string, number>([[from, 0]]);
  const previous = new Map<string, { node: string; edge: GraphEdge }>();
  const queue = new Set(verifiedNodes.keys());
  while (queue.size) {
    let current: string | undefined;
    for (const id of queue) if (dist.has(id) && (current === undefined || dist.get(id)! < dist.get(current)!)) current = id;
    if (!current) break;
    if (current === to) break;
    queue.delete(current);
    for (const edge of edges) {
      const next = edge.from === current ? edge.to : edge.to === current ? edge.from : null;
      if (!next || !queue.has(next)) continue;
      // A cross-floor connection must explicitly join verified stairs/elevators.
      const a = verifiedNodes.get(current)!; const b = verifiedNodes.get(next)!;
      if (a.floor !== b.floor && !(a.type === b.type && (a.type === 'stairs' || a.type === 'elevator'))) continue;
      const weight = edge.distance ?? Math.hypot(a.x - b.x, a.y - b.y) * 1000;
      const candidate = dist.get(current)! + weight;
      if (candidate < (dist.get(next) ?? Infinity)) { dist.set(next, candidate); previous.set(next, { node: current, edge }); }
    }
  }
  if (!dist.has(to)) return null;
  const ids = [to], pathEdges: GraphEdge[] = [];
  while (ids[0] !== from) {
    const step = previous.get(ids[0]); if (!step) return null;
    pathEdges.unshift(step.edge); ids.unshift(step.node);
  }
  return { nodes: ids.map(id => verifiedNodes.get(id)!), edges: pathEdges,
    totalDistance: pathEdges.every(e => e.distance !== undefined) ? pathEdges.reduce((n, e) => n + e.distance!, 0) : undefined };
}

export function routeForRooms(graph: Graph, start: Room, end: Room): Route | null {
  if (!start.verified || !end.verified || !start.accessNode || !end.accessNode || !start.entrancePosition || !end.entrancePosition) return null;
  return shortestPath(graph, start.accessNode, end.accessNode);
}

export function segmentRoute(route: Route): { floor: number; nodes: GraphNode[] }[] {
  const segments: { floor: number; nodes: GraphNode[] }[] = [];
  for (const node of route.nodes) {
    let last = segments.at(-1);
    if (!last || last.floor !== node.floor) { last = { floor: node.floor, nodes: [] }; segments.push(last); }
    last.nodes.push(node);
  }
  return segments;
}
