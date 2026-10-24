import { describe, expect, it } from 'vitest';
import { crc32, createZip, readZip } from './zip';

describe('zip', () => {
  it('computes crc32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips files with Japanese names', async () => {
    const zip = await createZip([
      { path: '数学/プリント1/project.json', data: new Blob(['{"a":1}']) },
      { path: '数学/プリント1/images/01.png', data: new Blob([new Uint8Array([1, 2, 3, 255])]) },
    ]);
    const entries = await readZip(zip);
    expect(entries.map((e) => e.path)).toEqual(['数学/プリント1/project.json', '数学/プリント1/images/01.png']);
    expect(await entries[0].data.text()).toBe('{"a":1}');
    expect([...new Uint8Array(await entries[1].data.arrayBuffer())]).toEqual([1, 2, 3, 255]);
  });

  it('reads deflate entries', async () => {
    // 無圧縮で作ってから、1件目を Deflate に書き換えた ZIP を組み立てる
    const text = 'hello hello hello hello';
    const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    const comp = new Uint8Array(await new Response(stream).arrayBuffer());
    const name = new TextEncoder().encode('a.txt');
    const crc = crc32(new TextEncoder().encode(text));
    const local = new Uint8Array(30 + name.length);
    let v = new DataView(local.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(8, 8, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, comp.length, true);
    v.setUint32(22, text.length, true);
    v.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length);
    v = new DataView(cd.buffer);
    v.setUint32(0, 0x02014b50, true);
    v.setUint16(10, 8, true);
    v.setUint32(16, crc, true);
    v.setUint32(20, comp.length, true);
    v.setUint32(24, text.length, true);
    v.setUint16(28, name.length, true);
    cd.set(name, 46);
    const end = new Uint8Array(22);
    v = new DataView(end.buffer);
    v.setUint32(0, 0x06054b50, true);
    v.setUint16(8, 1, true);
    v.setUint16(10, 1, true);
    v.setUint32(12, cd.length, true);
    v.setUint32(16, local.length + comp.length, true);
    const entries = await readZip(new Blob([local, comp, cd, end]));
    expect(entries).toHaveLength(1);
    expect(await entries[0].data.text()).toBe(text);
  });
});
