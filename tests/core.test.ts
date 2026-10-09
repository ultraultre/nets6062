import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { assetUrl } from '../src/utils/paths';
import { floorAt, fromSvgPoint, parseRoomId, routeForRooms, searchRooms, segmentRoute, shortestPath, toSvgPoint } from '../src/navigation/core';
import type { Graph, Room } from '../src/types';

const root = path.resolve(import.meta.dirname, '..');
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', name), 'utf8'));
const room = (id: string, floor = 1, verified = true): Room => ({id,name:id,floor,labelPosition:{x:.3,y:.4},entrancePosition:verified?{x:.3,y:.41}:null,accessNode:verified?`${id}-door`:null,zone:null,verified,source:'test'});

describe('static data and assets', () => {
  it('loads announcements and six floor maps', () => {
    const notices = read('notices.json'); const floors = read('floors.json');
    expect(notices.length).toBeGreaterThan(0);
    expect(notices.every((n: {title:string;date:string;body:string}) => n.title && n.date && n.body)).toBe(true);
    expect(floors).toHaveLength(6);
    for (const f of floors) expect(fs.existsSync(path.join(root, 'public', f.image))).toBe(true);
    expect(fs.existsSync(path.join(root, 'index.html'))).toBe(true);
  });
  it('indexes only actually copied, approved downloads', () => {
    const files = read('files.json');
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      expect(fs.existsSync(path.join(root, 'document', f.relativePath))).toBe(true);
      expect(fs.existsSync(path.join(root, 'public', 'downloads', f.relativePath))).toBe(true);
      expect(f.size).toBeGreaterThan(0);
    }
    const pending = read('pending-files.json');
    const policy = JSON.parse(fs.readFileSync(path.join(root, 'document-review.json'), 'utf8'));
    const held = policy.exclude.find((name: string) => name.includes('最佳团日'));
    expect(held).toBeTruthy();
    expect(files.some((f: {relativePath:string}) => f.relativePath === held)).toBe(false);
    expect(fs.existsSync(path.join(root, 'public', 'downloads', held))).toBe(false);
    if (fs.existsSync(path.join(root, 'document', held))) {
      expect(pending.some((f: {name:string}) => f.name === held)).toBe(true);
    }
  });
  it('encodes Chinese and special characters under project and user page bases', () => {
    expect(assetUrl('downloads/请假 单.docx', '/project-name/')).toBe('/project-name/downloads/%E8%AF%B7%E5%81%87%20%E5%8D%95.docx');
    expect(assetUrl('maps/1f.webp', '/')).toBe('/maps/1f.webp');
  });
});

describe('room search and map coordinates', () => {
  const rooms = read('rooms.json') as Room[];
  it('parses exact IDs without merging 5- and 5F-', () => {
    expect(parseRoomId(' 5f-015 ')).toBe('5F-015');
    expect(parseRoomId('5-015')).toBe('5-015');
    expect(parseRoomId('3-092A')).toBe('3-092A');
    expect(parseRoomId('3-92')).toBeNull();
    expect(rooms.some(r => r.id === '5F-015')).toBe(true);
    expect(rooms.some(r => r.id === '5-015')).toBe(true);
  });
  it('searches actual room labels', () => {
    expect(searchRooms(rooms, '6-090A').map(r => r.id)).toContain('6-090A');
    expect(searchRooms(rooms, 'NO SUCH ROOM')).toEqual([]);
  });
  it('switches floor with bounds and round-trips normalized coordinates', () => {
    expect(floorAt(7)).toBe(6); expect(floorAt(0)).toBe(1);
    expect(fromSvgPoint(toSvgPoint({x:.36,y:.72}))).toEqual({x:.36,y:.72});
    expect(rooms.every(r => r.labelPosition.x >= 0 && r.labelPosition.x <= 1 && r.labelPosition.y >= 0 && r.labelPosition.y <= 1)).toBe(true);
  });
});

describe('verified path planning', () => {
  const graph: Graph = {version:1,nodes:[
    {id:'a',floor:1,x:.1,y:.1,type:'entrance',verified:true},
    {id:'b',floor:1,x:.2,y:.1,type:'corridor',verified:true},
    {id:'c',floor:1,x:.3,y:.1,type:'entrance',verified:true},
    {id:'s1',floor:1,x:.4,y:.1,type:'stairs',verified:true},
    {id:'s2',floor:2,x:.4,y:.1,type:'stairs',verified:true},
    {id:'d',floor:2,x:.6,y:.1,type:'entrance',verified:true},
    {id:'fake',floor:2,x:.8,y:.1,type:'corridor',verified:false},
  ],edges:[
    {id:'ab',from:'a',to:'b',distance:1,verified:true},
    {id:'bc',from:'b',to:'c',distance:1,verified:true},
    {id:'ac',from:'a',to:'c',distance:10,verified:true},
    {id:'bs',from:'b',to:'s1',distance:2,verified:true},
    {id:'ss',from:'s1',to:'s2',distance:4,verified:true},
    {id:'sd',from:'s2',to:'d',distance:2,verified:true},
    {id:'bad',from:'c',to:'fake',distance:.1,verified:true},
  ]};
  it('finds the shortest verified route', () => { const route = shortestPath(graph,'a','c'); expect(route?.nodes.map(n=>n.id)).toEqual(['a','b','c']); expect(route?.totalDistance).toBe(2); });
  it('returns unreachable for disconnected or unverified nodes and edges', () => { expect(shortestPath(graph,'a','fake')).toBeNull(); expect(shortestPath({...graph,edges:[]},'a','d')).toBeNull(); expect(shortestPath({...graph,edges:graph.edges.map(e=>({...e,verified:false}))},'a','c')).toBeNull(); });
  it('crosses floors only through explicit matching stair/elevator nodes', () => { const route = shortestPath(graph,'a','d'); expect(route?.nodes.map(n=>n.id)).toEqual(['a','b','s1','s2','d']); expect(segmentRoute(route!)).toEqual([{floor:1,nodes:route!.nodes.slice(0,3)},{floor:2,nodes:route!.nodes.slice(3)}]); const invalid = {...graph,edges:[...graph.edges,{id:'shortcut',from:'a',to:'d',distance:0,verified:true}]}; expect(shortestPath(invalid,'a','d')?.nodes.map(n=>n.id)).toEqual(['a','b','s1','s2','d']); });
  it('does not present an unverified room as navigable', () => { const start = room('1-001',1,false); const end = room('2-001',2,true); expect(routeForRooms(graph,start,end)).toBeNull(); });
});
