// Layout uses a 2400-pixel drawing space; print presets render at higher resolution.
export function sheetLayout(count, format = '3:2', requestedColumns = 'auto') {
  if (!Number.isInteger(count) || count < 1) throw new Error('这一卷还没有照片。');
  const width = 2400, margin = 80;
  const fixed = format !== 'free';
  if (!['3:2', '16:9', 'free'].includes(format)) throw new Error('请选择预览图比例。');
  const columns = requestedColumns === 'auto' ? null : Number(requestedColumns);
  if (columns !== null && (![3, 4, 6, 8].includes(columns))) throw new Error('请选择每行帧数。');
  if (!fixed) {
    const cols = columns || 6, rows = Math.ceil(count / cols), gap = 28;
    const slotW = (width - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = Math.round(slotW * 2 / 3), rowH = cellH + 72;
    const height = 310 + rows * rowH + 100;
    if (height > 28000) throw new Error('照片较多，请选择每行 8 帧后再生成。');
    return { width, height, outputWidth: width, outputHeight: height, margin, gap, cols, rows, slotW, cellW: slotW, cellH, rowH, gridY: 310, fixed };
  }
  const height = format === '3:2' ? 1600 : 1350;
  const outputWidth = format === '3:2' ? 3600 : 3840;
  const outputHeight = format === '3:2' ? 2400 : 2160;
  const gap = 24, header = 250, footer = 95, caption = 50;
  const available = height - header - footer;
  function candidate(cols) {
    const rows = Math.ceil(count / cols);
    const slotW = (width - margin * 2 - gap * (cols - 1)) / cols;
    const cellH = Math.min(slotW * 2 / 3, (available - (rows - 1) * gap) / rows - caption);
    return { cols, rows, slotW, cellH, cellW: cellH * 3 / 2 };
  }
  const options = columns ? [candidate(columns)] : Array.from({ length: Math.min(count, 12) }, (_, i) => candidate(i + 1));
  const best = options.reduce((a, b) => b.cellH > a.cellH ? b : a);
  if (best.cellH < 48) throw new Error('照片较多，当前排布过密。请选择自动排布，或切换为按内容自动适配。');
  const rowH = best.cellH + caption + gap;
  const gridHeight = best.rows * (best.cellH + caption) + (best.rows - 1) * gap;
  return { width, height, outputWidth, outputHeight, margin, gap, ...best, rowH, gridY: header + (available - gridHeight) / 2, fixed };
}

export function framePosition(layout, index, count) {
  const { width, margin, cols, slotW, cellW, gap, gridY, rowH, fixed } = layout;
  const row = Math.floor(index / cols), column = index % cols;
  const rowCount = Math.min(cols, count - row * cols);
  const left = fixed ? (width - rowCount * slotW - (rowCount - 1) * gap) / 2 : margin;
  return { x: left + column * (slotW + gap) + (slotW - cellW) / 2, y: gridY + row * rowH };
}
