import { describe, expect, it } from 'vitest';
import { findPageNumber, orderByPageNumbers, parsePageNumberText } from './pageNumber';

describe('parsePageNumberText', () => {
  it('よくある書き方を読む', () => {
    expect(parsePageNumberText('3')).toBe(3);
    expect(parsePageNumberText('- 3 -')).toBe(3);
    expect(parsePageNumberText('— 12 —')).toBe(12);
    expect(parsePageNumberText('－１２－')).toBe(12);
    expect(parsePageNumberText('p.12')).toBe(12);
    expect(parsePageNumberText('P 7')).toBe(7);
    expect(parsePageNumberText('ｐ．８')).toBe(8);
    expect(parsePageNumberText('page 4')).toBe(4);
    expect(parsePageNumberText('12ページ')).toBe(12);
    expect(parsePageNumberText('第3頁')).toBe(3);
    expect(parsePageNumberText('5/8')).toBe(5);
    expect(parsePageNumberText('５／８')).toBe(5);
  });

  it('ページ番号でないものは読まない', () => {
    expect(parsePageNumberText('(3)')).toBeNull();
    expect(parsePageNumberText('2026')).toBeNull();
    expect(parsePageNumberText('0')).toBeNull();
    expect(parsePageNumberText('問3')).toBeNull();
    expect(parsePageNumberText('2年 3組')).toBeNull();
    expect(parsePageNumberText('数学の問題 3')).toBeNull();
  });
});

describe('findPageNumber', () => {
  it('行全体が番号の行を優先する', () => {
    expect(findPageNumber(['数学Ⅰ 第2章', '- 5 -'])).toBe(5);
  });
  it('行の端の印つきの番号を拾う', () => {
    expect(findPageNumber(['数学Ⅰ  p.14'])).toBe(14);
    expect(findPageNumber(['- 9 -  ©数研出版'])).toBe(9);
  });
  it('印のない端の数字は拾わない', () => {
    expect(findPageNumber(['2年  3組  番  氏名'])).toBeNull();
    expect(findPageNumber([])).toBeNull();
  });
});

describe('orderByPageNumbers', () => {
  it('番号順に並べる', () => {
    expect(orderByPageNumbers([3, 1, 2])).toEqual([1, 2, 0]);
  });
  it('番号のないページは直前のページについていく', () => {
    expect(orderByPageNumbers([2, null, 1, null])).toEqual([2, 3, 0, 1]);
  });
  it('先頭の番号のないページは先頭のまま', () => {
    expect(orderByPageNumbers([null, 2, 1])).toEqual([0, 2, 1]);
  });
  it('同じ番号は元の順', () => {
    expect(orderByPageNumbers([2, 1, 1])).toEqual([1, 2, 0]);
  });
  it('並べ替えが要らないときは null', () => {
    expect(orderByPageNumbers([1, 2, 3])).toBeNull();
    expect(orderByPageNumbers([null, 5, null])).toBeNull();
  });
});
