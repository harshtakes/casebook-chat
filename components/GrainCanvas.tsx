'use client';

import { useEffect, useRef } from 'react';

export default function GrainCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;

    let raf: number;
    function drawGrain() {
      const id = ctx.createImageData(200, 200);
      for (let i = 0; i < id.data.length; i += 4) {
        const v = (Math.random() * 255) | 0;
        id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
        id.data[i + 3] = 255;
      }
      ctx.putImageData(id, 0, 0);
      raf = requestAnimationFrame(drawGrain);
    }
    drawGrain();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={200}
      height={200}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 999,
        opacity: 0.028,
        mixBlendMode: 'multiply',
      }}
    />
  );
}
