import { describe, expect, it } from 'vitest';
import type { TextObject } from '../types/model';
import { splitFlowText } from './describe';

// 縦書きは計測に canvas を使わないので、node の環境でも確かめられる
const base: TextObject & { fieldWidth: number; fieldHeight: number } = {
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
  vertical: true,
  fieldWidth: 30,
  // 余白（上下 3px）＋5文字分
  fieldHeight: 106,
  flow: { dx: -60, dy: -200, width: 30, height: 200 },
};

describe('splitFlowText', () => {
  it('1つ目の欄に入る分だけを残し、残りを続きの欄へ回す', () => {
    expect(splitFlowText({ ...base, text: 'あいうえおかきく' })).toEqual(['あいうえお', 'かきく']);
  });

  it('入りきる文字はすべて1つ目の欄に置く', () => {
    expect(splitFlowText({ ...base, text: 'あいう' })).toEqual(['あいう', '']);
  });

  it('句読点は続きの欄の頭に来ないよう、前の欄の末尾にぶら下げる', () => {
    expect(splitFlowText({ ...base, text: 'あいうえお。かき' })).toEqual(['あいうえお。', 'かき']);
  });

  it('入力した改行で続きの欄へ移る', () => {
    expect(splitFlowText({ ...base, text: 'あい\nうえ\nお' })).toEqual(['あい', 'うえ\nお']);
    expect(splitFlowText({ ...base, text: 'あいうえおか\nき' })).toEqual(['あいうえお', 'か\nき']);
  });
});
