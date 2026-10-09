export type Point = { x: number; y: number };
export type Room = { id: string; name: string; floor: number; labelPosition: Point; entrancePosition: Point | null; accessNode: string | null; zone: string | null; verified: boolean; source: string };
export type Floor = { floor: number; image: string; width: number; height: number; roomCount: number };
export type GraphNode = { id: string; floor: number; x: number; y: number; type: 'corridor' | 'corner' | 'entrance' | 'stairs' | 'elevator'; label?: string; verified: boolean };
export type GraphEdge = { id: string; from: string; to: string; distance?: number; verified: boolean; accessible?: boolean; note?: string };
export type Graph = { version: number; nodes: GraphNode[]; edges: GraphEdge[] };
export type Notice = { id: string; title: string; date: string; category: string; important: boolean; body: string };
export type DownloadFile = { name: string; relativePath: string; extension: string; size: number; category: string };
