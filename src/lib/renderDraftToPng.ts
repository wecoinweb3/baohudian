import type { ConversationDesignDraft } from './chatDesign';

export async function renderDraftToPng(draft: ConversationDesignDraft) {
  const canvasWidth = 1200;
  const canvasHeight = canvasWidth * (draft.canvas.height / draft.canvas.width);
  const safeWidth = canvasWidth * (draft.canvas.safeAreaWidth / draft.canvas.width);
  const safeHeight = canvasHeight * (draft.canvas.safeAreaHeight / draft.canvas.height);
  const safeLeft = (canvasWidth - safeWidth) / 2;
  const safeTop = (canvasHeight - safeHeight) / 2;
  const padding = 140;
  const bottomMetaHeight = draft.bottomMeta?.proofingNote || (draft.bottomMeta?.colorLegend?.length ?? 0) > 0 ? 110 : 0;
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth + padding * 2;
  canvas.height = canvasHeight + padding * 2 + bottomMetaHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');

  const originX = padding;
  const originY = padding;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = draft.canvas.backgroundColor;
  ctx.fillRect(originX, originY, canvasWidth, canvasHeight);
  ctx.strokeStyle = '#444444';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, canvasWidth, canvasHeight);

  const drawLine = (x1: number, y1: number, x2: number, y2: number, label: string, vertical = false) => {
    ctx.save();
    ctx.strokeStyle = '#555555';
    ctx.fillStyle = '#111111';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.font = 'bold 30px Microsoft YaHei';
    ctx.textAlign = 'center';
    if (vertical) {
      ctx.translate(x1 - 20, (y1 + y2) / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(label, 0, 0);
    } else {
      ctx.fillText(label, (x1 + x2) / 2, y1 - 10);
    }
    ctx.restore();
  };

  drawLine(originX, originY - 80, originX + canvasWidth, originY - 80, `${draft.canvas.width}CM`);
  drawLine(originX + safeLeft, originY - 35, originX + safeLeft + safeWidth, originY - 35, `${draft.canvas.safeAreaWidth}CM`);
  drawLine(originX - 45, originY + safeTop, originX - 45, originY + safeTop + safeHeight, `${draft.canvas.safeAreaHeight}CM`, true);
  drawLine(originX + canvasWidth + 70, originY, originX + canvasWidth + 70, originY + canvasHeight, `${draft.canvas.height}CM`, true);

  const drawWrappedText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 4) => {
    const normalized = text.replace(/\s*\n\s*/g, ' ');
    const chars = normalized.split('');
    let line = '';
    let currentY = y;
    let lineCount = 0;
    for (const char of chars) {
      const testLine = line + char;
      if (ctx.measureText(testLine).width > maxWidth && line) {
        ctx.fillText(line, x, currentY);
        line = char;
        currentY += lineHeight;
        lineCount += 1;
        if (lineCount >= maxLines - 1) break;
      } else {
        line = testLine;
      }
    }
    if (line) {
      const remainingText = lineCount >= maxLines - 1 && chars.join('').length > 0;
      let finalLine = line;
      while (remainingText && ctx.measureText(`${finalLine}…`).width > maxWidth && finalLine.length > 0) {
        finalLine = finalLine.slice(0, -1);
      }
      ctx.fillText(remainingText ? `${finalLine}…` : finalLine, x, currentY);
    }
  };

  for (const item of draft.elements) {
    const x = originX + safeLeft + safeWidth * (item.x ?? 0);
    const y = originY + safeTop + safeHeight * (item.y ?? 0);
    const width = safeWidth * (item.width ?? 0.3);
    const height = safeHeight * (item.height ?? 0.12);
    if (item.type === 'rect') {
      ctx.fillStyle = item.color || '#ef0000';
      ctx.fillRect(x, y, width, height);
    }
    if (item.type === 'text') {
      if (item.backgroundColor) {
        ctx.fillStyle = item.backgroundColor;
        ctx.fillRect(x, y, width, height);
      }
      ctx.fillStyle = item.color || '#111111';
      const fontWeight = item.fontWeight || '700';
      const fontSizePx = Math.max(24, height * 0.55 * (item.fontSize ?? 1));
      ctx.font = `${fontWeight} ${fontSizePx}px Microsoft YaHei`;
      ctx.textAlign = item.textAlign || 'center';
      ctx.textBaseline = 'middle';
      const text = item.text || '文字';
      const centerY = y + height / 2;
      const paddingX = 8;
      const drawX = item.textAlign === 'left' ? x + paddingX : item.textAlign === 'right' ? x + width - paddingX : x + width / 2;
      if ((item.letterSpacing ?? 0) !== 0) {
        const chars = text.split('');
        const spacingPx = (item.letterSpacing ?? 0) * fontSizePx;
        const charWidths = chars.map((char) => ctx.measureText(char).width);
        const totalWidth = charWidths.reduce((sum, w) => sum + w, 0) + Math.max(0, chars.length - 1) * spacingPx;
        let cursorX = item.textAlign === 'left' ? drawX : item.textAlign === 'right' ? drawX - totalWidth : drawX - totalWidth / 2;
        chars.forEach((char, index) => {
          ctx.fillText(char, cursorX, centerY);
          cursorX += charWidths[index] + spacingPx;
        });
      } else {
        ctx.fillText(text, drawX, centerY, width);
      }
    }
    if (item.type === 'image') {
      if (item.src) {
        await new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => { ctx.drawImage(img, x, y, width, height); resolve(); };
          img.onerror = () => {
            ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = '#94a3b8'; ctx.strokeRect(x, y, width, height); ctx.fillStyle = '#64748b'; ctx.font = 'bold 26px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('图片区', x + width / 2, y + height / 2); resolve();
          };
          img.src = item.src;
        });
      } else {
        ctx.fillStyle = '#e2e8f0'; ctx.fillRect(x, y, width, height); ctx.strokeStyle = '#94a3b8'; ctx.strokeRect(x, y, width, height); ctx.fillStyle = '#64748b'; ctx.font = 'bold 26px Microsoft YaHei'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('图片区', x + width / 2, y + height / 2);
      }
    }
  }

  if (bottomMetaHeight > 0) {
    const footerTop = originY + canvasHeight + 18;
    const footerLeft = originX;
    const footerWidth = canvasWidth;
    const proofingWidth = Math.round(footerWidth * 0.68);
    if (draft.bottomMeta?.proofingNote) {
      ctx.fillStyle = '#111111'; ctx.font = 'bold 16px Microsoft YaHei'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      drawWrappedText(draft.bottomMeta.proofingNote, footerLeft, footerTop + 8, proofingWidth - 20, 20, 4);
    }
    const legends = draft.bottomMeta?.colorLegend || [];
    if (legends.length > 0) {
      const legendAreaLeft = footerLeft + proofingWidth + 12;
      const swatchSize = 42;
      let cursorX = legendAreaLeft;
      const rowY = footerTop + 12;
      legends.forEach((legend, index) => {
        if (index > 0) cursorX += 26;
        ctx.fillStyle = legend.swatchColor || '#ffffff'; ctx.fillRect(cursorX, rowY, swatchSize, swatchSize * 0.72); ctx.strokeStyle = '#666666'; ctx.lineWidth = 1; ctx.strokeRect(cursorX, rowY, swatchSize, swatchSize * 0.72);
        ctx.fillStyle = '#111111'; ctx.font = 'bold 16px Microsoft YaHei'; ctx.textBaseline = 'middle'; ctx.fillText(legend.label, cursorX + swatchSize + 10, rowY + 11); ctx.font = '16px Microsoft YaHei'; ctx.fillText(legend.value, cursorX + swatchSize + 10, rowY + 31);
        cursorX += swatchSize + 10 + Math.max(80, ctx.measureText(`${legend.label}${legend.value}`).width + 20);
        if (cursorX > footerLeft + footerWidth - 120 && index < legends.length - 1) cursorX = legendAreaLeft;
      });
    }
  }

  return canvas.toDataURL('image/png');
}