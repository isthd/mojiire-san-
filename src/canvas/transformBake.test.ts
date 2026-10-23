import { describe, expect, it } from 'vitest';
import type { LineObject, ShapeObject, TextObject } from '../types/model';
import { bakeTransform } from './transformBake';

const line: LineObject = {
  id: 'l',
  type: 'line',
  x: 10,
  y: 10,
  rotation: 0,
  opacity: 1,
  points: [0, 0, 100, 0],
  color: '#000',
  strokeWidth: 2,
  dash: 'solid',
  arrowStart: false,
  arrowEnd: false,
  arrowSize: 10,
};

describe('bakeTransform', () => {
  it('bakes rotation and scale into line points', () => {
    const { patch, node } = bakeTransform(line, { x: 10, y: 10, rotation: 90, scaleX: 2, scaleY: 2 });
    const pts = (patch as Partial<LineObject>).points!;
    expect(pts[2]).toBeCloseTo(0);
    expect(pts[3]).toBeCloseTo(200);
    expect(node).toEqual({ x: 10, y: 10, rotation: 0, scaleX: 1, scaleY: 1 });
  });

  it('bakes scale into shape size but keeps rotation', () => {
    const rect: ShapeObject = {
      id: 'r',
      type: 'rect',
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      width: 50,
      height: 20,
      strokeColor: '#000',
      strokeWidth: 2,
      fill: null,
      fillOpacity: 1,
      dash: 'solid',
    };
    const { patch } = bakeTransform(rect, { x: 5, y: 6, rotation: 30, scaleX: 2, scaleY: 3 });
    expect(patch).toMatchObject({ x: 5, y: 6, rotation: 30, width: 100, height: 60 });
  });

  it('scales the box of an empty answer field together with the font size', () => {
    const field: TextObject = {
      id: 't',
      type: 'text',
      x: 0,
      y: 0,
      rotation: 0,
      opacity: 1,
      text: '',
      fontFamily: 'gothic',
      fontSize: 20,
      color: '#000',
      bold: false,
      italic: false,
      align: 'left',
      background: null,
      outlineColor: null,
      outlineWidth: 0,
      fieldWidth: 100,
      fieldHeight: 30,
    };
    const { patch } = bakeTransform(field, { x: 0, y: 0, rotation: 0, scaleX: 2, scaleY: 2 });
    expect(patch).toMatchObject({ fontSize: 40, fieldWidth: 200, fieldHeight: 60 });
  });
});
