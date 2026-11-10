import React, { useRef, useState } from 'react';
import { Dialog } from './Dialog';

export function PhotoViewer({ image, onClose }) {
  const [zoom, setZoom] = useState(1), [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(), viewport = useRef();
  const bounded = (x, y, scale = zoom) => {
    const box = viewport.current?.getBoundingClientRect();
    const maxX = (box?.width || 0) * (scale - 1) / 2, maxY = (box?.height || 0) * (scale - 1) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const resize = value => { const next = Math.min(6, Math.max(1, value)); setZoom(next); setOffset(bounded(offset.x, offset.y, next)); };
  return <Dialog className="photo-viewer" aria-labelledby="photo-title" onClose={onClose}>
    <header><h2 id="photo-title">盒照放大核對</h2><button aria-label="關閉大圖" onClick={onClose} autoFocus>關閉</button></header>
    <div className="photo-controls"><button className="secondary" onClick={() => resize(zoom - .5)} disabled={zoom === 1}>縮小</button><output aria-live="polite">{Math.round(zoom * 100)}%</output><button className="secondary" onClick={() => resize(zoom + .5)} disabled={zoom === 6}>放大</button><button className="secondary" onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }}>適合畫面</button></div>
    <div className="photo-viewport" ref={viewport} tabIndex={-1} onPointerDown={event => { if (zoom === 1 || (event.pointerType === 'mouse' && event.button !== 0)) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { id: event.pointerId, x: event.clientX - offset.x, y: event.clientY - offset.y }; }}
      onPointerMove={event => { if (drag.current?.id === event.pointerId) setOffset(bounded(event.clientX - drag.current.x, event.clientY - drag.current.y)); }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
      <img src={image} alt="放大的商品盒照" draggable="false" style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})` }}/>
    </div><p>放大後可用滑鼠或觸控拖曳。影像細節以目前保存的照片為限。</p>
  </Dialog>;
}
