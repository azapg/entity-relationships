import { getNodesBounds, type Node } from '@xyflow/react'

const EXPORT_PADDING = 64
const MAX_BITMAP_EDGE = 4096

export type DiagramExportSource = {
  viewport: HTMLElement
  nodes: Node[]
  backgroundColor: string
}

export class DiagramExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagramExportError'
  }
}

export function diagramFileName(name: string, extension: 'png' | 'pdf') {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'diagrama'
  return `${base}.${extension}`
}

function shouldIncludeInExport(node: HTMLElement) {
  return !node.classList.contains('react-flow__node-toolbar')
    && !node.classList.contains('chen-hover-actions')
    && !node.classList.contains('react-flow__handle')
}

const SVG_PRESENTATION_PROPERTIES = [
  'color',
  'fill',
  'fill-opacity',
  'font-family',
  'font-size',
  'font-weight',
  'opacity',
  'stroke',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-opacity',
  'stroke-width',
  'text-anchor',
] as const

/**
 * html-to-image deep-clones nested SVGs without copying computed styles onto
 * their child paths. Materialize the resolved presentation values briefly so
 * React Flow edges and relationship diamonds survive SVG serialization.
 */
function inlineSvgPresentation(viewport: HTMLElement) {
  const snapshots = Array.from(viewport.querySelectorAll<SVGElement>('svg *')).map((element) => {
    const previous = new Map<string, string | null>()
    const computed = getComputedStyle(element)
    SVG_PRESENTATION_PROPERTIES.forEach((property) => {
      previous.set(property, element.getAttribute(property))
      const value = computed.getPropertyValue(property)
      if (value) element.setAttribute(property, value)
    })
    return { element, previous }
  })

  return () => snapshots.forEach(({ element, previous }) => {
    previous.forEach((value, property) => {
      if (value === null) element.removeAttribute(property)
      else element.setAttribute(property, value)
    })
  })
}

/** Capture the complete model bounds, regardless of the visible pan and zoom. */
export async function captureDiagramCanvas(source: DiagramExportSource) {
  if (source.nodes.length === 0) {
    throw new DiagramExportError('Añade al menos una entidad antes de exportar.')
  }

  await document.fonts?.ready

  const bounds = getNodesBounds(source.nodes)
  const width = Math.max(1, Math.ceil(bounds.width + EXPORT_PADDING * 2))
  const height = Math.max(1, Math.ceil(bounds.height + EXPORT_PADDING * 2))
  const pixelRatio = Math.min(2, MAX_BITMAP_EDGE / width, MAX_BITMAP_EDGE / height)
  const { toCanvas } = await import('html-to-image')
  const restoreSvgPresentation = inlineSvgPresentation(source.viewport)

  try {
    return await toCanvas(source.viewport, {
      backgroundColor: source.backgroundColor,
      cacheBust: true,
      height,
      width,
      pixelRatio,
      filter: (node) => !(node instanceof HTMLElement) || shouldIncludeInExport(node),
      style: {
        height: `${height}px`,
        transform: `translate(${EXPORT_PADDING - bounds.x}px, ${EXPORT_PADDING - bounds.y}px) scale(1)`,
        transformOrigin: 'top left',
        width: `${width}px`,
      },
    })
  } finally {
    restoreSvgPresentation()
  }
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new DiagramExportError('No se pudo crear la imagen del diagrama.'))
    }, 'image/png')
  })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function downloadDiagramPng(canvas: HTMLCanvasElement, diagramName: string) {
  downloadBlob(await canvasToBlob(canvas), diagramFileName(diagramName, 'png'))
}

export async function downloadDiagramPdf(canvas: HTMLCanvasElement, diagramName: string) {
  const { jsPDF } = await import('jspdf')
  const landscape = canvas.width >= canvas.height
  const pdf = new jsPDF({
    compress: true,
    format: 'a4',
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'mm',
  })
  const margin = 10
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const scale = Math.min(
    (pageWidth - margin * 2) / canvas.width,
    (pageHeight - margin * 2) / canvas.height,
  )
  const width = canvas.width * scale
  const height = canvas.height * scale
  pdf.addImage(canvas, 'PNG', (pageWidth - width) / 2, (pageHeight - height) / 2, width, height, undefined, 'FAST')
  pdf.save(diagramFileName(diagramName, 'pdf'))
}

export async function copyDiagramImage(canvas: HTMLCanvasElement) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new DiagramExportError('Este navegador no permite copiar imágenes al portapapeles.')
  }
  const blob = await canvasToBlob(canvas)
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
}
