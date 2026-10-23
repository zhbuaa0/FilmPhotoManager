import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sheetLayout, framePosition } from '../public/sheet-layout.mjs';

test('横向打印比例完整容纳不同帧数和排布的整卷照片', () => {
  for (const format of ['3:2', '16:9']) {
    for (const count of [1, 5, 24, 35, 36, 72]) {
      for (const columns of ['auto', 3, 4, 6, 8]) {
        let layout;
        try { layout = sheetLayout(count, format, columns); }
        catch (e) { assert.notEqual(columns, 'auto'); assert.ok(count >= 35); assert.match(e.message, /排布过密/); continue; }
        assert.equal(layout.outputWidth / layout.outputHeight, format === '3:2' ? 3 / 2 : 16 / 9);
        for (let i = 0; i < count; i++) {
          const { x, y } = framePosition(layout, i, count);
          assert.ok(x >= layout.margin - 1e-6);
          assert.ok(x + layout.cellW <= layout.width - layout.margin + 1e-6);
          assert.ok(y >= 250);
          assert.ok(y + layout.cellH + 50 <= layout.height - 95 + 1e-6);
          const next = framePosition(layout, i + 1, count);
          if (i + 1 < count && Math.floor(i / layout.cols) === Math.floor((i + 1) / layout.cols)) assert.ok(next.x > x + layout.cellW);
        }
      }
    }
  }
});

test('保留按内容自动适配，并提示无法打印的过密排布', () => {
  const free = sheetLayout(36, 'free', 'auto');
  assert.equal(free.outputWidth, 2400); assert.equal(free.outputHeight, 2240);
  assert.throws(() => sheetLayout(251, '16:9', 3), /排布过密/);
});
