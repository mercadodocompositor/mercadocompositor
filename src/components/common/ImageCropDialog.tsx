import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Crop, LoaderCircle, Minus, Move, Plus, X } from 'lucide-react';

export interface ImageCropDialogProps {
  /** Arquivo escolhido pelo usuário; null mantém a janela fechada. */
  file: File | null;
  /** Proporção largura/altura da área de recorte (1 para avatar, 16/9 para capa). */
  aspect: number;
  /** Tamanho final em pixels. A imagem é reamostrada para caber exatamente nele. */
  outputWidth: number;
  outputHeight: number;
  title: string;
  /** Recorte circular apenas visual (o arquivo continua retangular). */
  round?: boolean;
  onCancel: () => void;
  onConfirm: (result: File) => void;
}

const MAX_ZOOM = 4;
const KEYBOARD_STEP = 24;

/**
 * Codifica em WebP (menor para a mesma qualidade). Navegadores sem codificador
 * WebP devolvem PNG no toBlob; nesse caso cai para JPEG.
 */
const encodeCanvas = async (canvas: HTMLCanvasElement, baseName: string): Promise<File> => {
  const toBlob = (type: string, quality: number) =>
    new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));

  let blob = await toBlob('image/webp', 0.86);
  let extension = 'webp';
  if (!blob || blob.type !== 'image/webp') {
    blob = await toBlob('image/jpeg', 0.88);
    extension = 'jpg';
  }
  if (!blob) throw new Error('Não foi possível processar a imagem neste navegador.');
  return new File([blob], `${baseName}.${extension}`, { type: blob.type, lastModified: Date.now() });
};

export const ImageCropDialog: React.FC<ImageCropDialogProps> = ({
  file,
  aspect,
  outputWidth,
  outputHeight,
  title,
  round = false,
  onCancel,
  onConfirm
}) => {
  const titleId = useId();
  const viewportRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [viewportWidth, setViewportWidth] = useState(0);
  const [zoom, setZoom] = useState(1);
  // Centro da área visível, em pixels da imagem original.
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [loadError, setLoadError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    setImage(null);
    setLoadError('');
    setZoom(1);
    img.onload = () => {
      setImage(img);
      setImageUrl(url);
      setCenter({ x: img.naturalWidth / 2, y: img.naturalHeight / 2 });
    };
    img.onerror = () => setLoadError('Não foi possível abrir esta imagem. Tente outro arquivo JPG, PNG ou WebP.');
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const node = viewportRef.current;
    if (!node) return;
    const observer = new ResizeObserver(entries => setViewportWidth(entries[0].contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, [file]);

  // Última versão de onCancel sem reinstalar o listener (nem roubar o foco) a cada render do pai.
  const cancelRef = useRef(onCancel);
  cancelRef.current = isProcessing ? () => {} : onCancel;

  useEffect(() => {
    if (!file) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    confirmRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cancelRef.current();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [file]);

  const viewportHeight = viewportWidth / aspect;
  const baseScale = image && viewportWidth
    ? Math.max(viewportWidth / image.naturalWidth, viewportHeight / image.naturalHeight)
    : 1;
  const scale = baseScale * zoom;

  // Mantém a área visível sempre coberta pela imagem (sem bordas vazias).
  const clampCenter = useCallback((next: { x: number; y: number }, nextScale: number) => {
    if (!image || !viewportWidth) return next;
    const halfW = viewportWidth / nextScale / 2;
    const halfH = viewportWidth / aspect / nextScale / 2;
    return {
      x: Math.min(Math.max(next.x, halfW), image.naturalWidth - halfW),
      y: Math.min(Math.max(next.y, halfH), image.naturalHeight - halfH)
    };
  }, [image, viewportWidth, aspect]);

  useEffect(() => {
    setCenter(current => clampCenter(current, scale));
  }, [scale, clampCenter]);

  const pan = (dx: number, dy: number) => {
    setCenter(current => clampCenter({ x: current.x - dx / scale, y: current.y - dy / scale }, scale));
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    pan(event.clientX - drag.x, event.clientY - drag.y);
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
  };

  const endDrag = () => { dragRef.current = null; };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    setZoom(current => Math.min(MAX_ZOOM, Math.max(1, current - event.deltaY * 0.0015)));
  };

  const handleViewportKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [KEYBOARD_STEP, 0],
      ArrowRight: [-KEYBOARD_STEP, 0],
      ArrowUp: [0, KEYBOARD_STEP],
      ArrowDown: [0, -KEYBOARD_STEP]
    };
    if (moves[event.key]) {
      event.preventDefault();
      pan(...moves[event.key]);
    } else if (event.key === '+' || event.key === '=') {
      setZoom(current => Math.min(MAX_ZOOM, current + 0.1));
    } else if (event.key === '-') {
      setZoom(current => Math.max(1, current - 0.1));
    }
  };

  const handleConfirm = async () => {
    if (!image || !viewportWidth || !file) return;
    setIsProcessing(true);
    try {
      const sourceWidth = viewportWidth / scale;
      const sourceHeight = viewportHeight / scale;
      const canvas = document.createElement('canvas');
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Não foi possível processar a imagem neste navegador.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(
        image,
        center.x - sourceWidth / 2,
        center.y - sourceHeight / 2,
        sourceWidth,
        sourceHeight,
        0,
        0,
        outputWidth,
        outputHeight
      );
      const baseName = file.name.replace(/\.[^.]+$/, '') || 'imagem';
      onConfirm(await encodeCanvas(canvas, baseName));
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Não foi possível processar a imagem.');
    } finally {
      setIsProcessing(false);
    }
  };

  if (!file) return null;

  const displayWidth = image ? image.naturalWidth * scale : 0;
  const displayHeight = image ? image.naturalHeight * scale : 0;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fadeIn">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Crop className="w-4 h-4 text-amber-400" aria-hidden="true" />
            <h2 id={titleId} className="text-base font-bold text-white">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            aria-label="Cancelar recorte"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <div
            ref={viewportRef}
            role="application"
            tabIndex={0}
            aria-label="Área de recorte. Arraste ou use as setas para posicionar; + e − para aproximar."
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            onWheel={handleWheel}
            onKeyDown={handleViewportKeyDown}
            style={{ aspectRatio: String(aspect), touchAction: 'none' }}
            className={`relative w-full overflow-hidden bg-slate-950 cursor-grab active:cursor-grabbing select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
              round ? 'mx-auto max-w-xs rounded-full' : 'rounded-2xl'
            }`}
          >
            {image && viewportWidth > 0 ? (
              <img
                src={imageUrl}
                alt=""
                draggable={false}
                className="absolute max-w-none pointer-events-none"
                style={{
                  width: displayWidth,
                  height: displayHeight,
                  left: viewportWidth / 2 - center.x * scale,
                  top: viewportHeight / 2 - center.y * scale
                }}
              />
            ) : !loadError && (
              <div className="absolute inset-0 flex items-center justify-center text-slate-400">
                <LoaderCircle className="w-6 h-6 animate-spin" aria-label="Carregando imagem" />
              </div>
            )}
            {!round && <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/20" />}
          </div>

          <p className="flex items-center justify-center gap-1.5 text-xs text-slate-400">
            <Move className="w-3.5 h-3.5" aria-hidden="true" /> Arraste para posicionar e use o controle para aproximar.
          </p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setZoom(current => Math.max(1, current - 0.2))}
              aria-label="Afastar"
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 transition"
            >
              <Minus className="w-4 h-4" />
            </button>
            <input
              type="range"
              min={1}
              max={MAX_ZOOM}
              step={0.01}
              value={zoom}
              onChange={event => setZoom(Number(event.target.value))}
              aria-label="Zoom"
              className="flex-1 accent-amber-500"
            />
            <button
              type="button"
              onClick={() => setZoom(current => Math.min(MAX_ZOOM, current + 0.2))}
              aria-label="Aproximar"
              className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-800 transition"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {loadError && (
            <p role="alert" className="text-xs font-semibold text-red-300">{loadError}</p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-800 px-5 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={isProcessing}
            className="px-4 py-2.5 rounded-xl border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-sm transition disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={handleConfirm}
            disabled={!image || isProcessing}
            className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50"
          >
            {isProcessing ? <LoaderCircle className="w-4 h-4 animate-spin" /> : <Crop className="w-4 h-4" />}
            <span>{isProcessing ? 'Processando...' : 'Aplicar recorte'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
