'use client';
// A 3D record in the browser. glTF, GLB and USDZ files render with Google's <model-viewer> web component, loaded
// from its CDN only on a page that shows one; CLO (.zprj, .zpac) and Browzwear (.bw, .bwg) project files open in
// their own software, so those get the file and a note. The file comes through /api/records/file after RLS.
import { createElement, useEffect, useState } from 'react';
// same test as PREVIEWABLE_3D in lib/records.ts (that module is server side)
const PREVIEWABLE_3D = /\.(glb|gltf|usdz)$/i;

const MV_SRC = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js';

export function ModelViewer({ recordId, filename, labels }: { recordId: string; filename: string; labels: { loading: string; openIn: string; download: string } }) {
  const previewable = PREVIEWABLE_3D.test(filename);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!previewable) return;
    if (customElements.get('model-viewer')) { setReady(true); return; }
    const s = document.createElement('script'); s.type = 'module'; s.src = MV_SRC; s.onload = () => setReady(true); document.head.appendChild(s);
    return () => { s.onload = null; };
  }, [previewable]);
  const url = `/api/records/file?id=${recordId}`;
  const tool = /\.(zprj|zpac)$/i.test(filename) ? 'CLO' : /\.(bw|bwg)$/i.test(filename) ? 'Browzwear VStitcher' : /\.(obj|fbx)$/i.test(filename) ? 'Blender, CLO or Browzwear' : null;
  return (
    <div className="grid gap-2">
      {previewable && (ready
        ? createElement('model-viewer', { src: url, 'camera-controls': '', 'auto-rotate': '', 'shadow-intensity': '1', style: { width: '100%', height: 420, background: 'var(--paper)', borderRadius: 10 }, alt: filename })
        : <div className="muted small p-4" style={{ background: 'var(--paper)', borderRadius: 10, height: 420 }}>{labels.loading}</div>)}
      <div className="small flex gap-2 items-center flex-wrap">{tool && <span className="muted">{labels.openIn.replace('{tool}', tool)}</span>}<a className="btn sm" href={url} target="_blank" rel="noopener">{labels.download}</a></div>
    </div>
  );
}
