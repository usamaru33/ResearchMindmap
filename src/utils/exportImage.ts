import { tr } from '../i18n/current';
import { getNodesBounds, getViewportForBounds, type Node } from '@xyflow/react';
import { safeFileName } from './download';

export type ImageFormat = 'png' | 'svg';

const MAX_SIDE = 6000;
const PADDING = 0.06;

/** Output size: the map's bounds at 1.5x, capped so huge maps stay exportable. */
export function imageSize(bounds: { width: number; height: number }): { width: number; height: number } {
  const scale = Math.min(1.5, MAX_SIDE / Math.max(bounds.width, bounds.height, 1));
  return { width: Math.max(320, Math.round(bounds.width * scale)), height: Math.max(240, Math.round(bounds.height * scale)) };
}

/**
 * Render the whole map (not just what is on screen) to PNG or SVG and save it.
 * html-to-image is loaded on demand to keep it out of the main bundle.
 */
export async function exportMapImage(nodes: Node[], format: ImageFormat, baseName: string): Promise<void> {
  const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport || nodes.length === 0) throw new Error(tr('error.noNodes'));
  const { toPng, toSvg } = await import('html-to-image');
  const bounds = getNodesBounds(nodes);
  const { width, height } = imageSize(bounds);
  const view = getViewportForBounds(bounds, width, height, 0.05, 4, PADDING);
  const options = {
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#ffffff',
    width,
    height,
    style: {
      width: `${width}px`,
      height: `${height}px`,
      transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})`,
    },
  };
  const dataUrl = format === 'png' ? await toPng(viewport, { ...options, pixelRatio: 1 }) : await toSvg(viewport, options);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = `${safeFileName(baseName)}.${format}`;
  a.click();
}
