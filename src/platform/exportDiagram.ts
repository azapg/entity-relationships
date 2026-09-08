import { getNodesBounds, type Node } from '@xyflow/react'
import { serializeDiagramFile } from '../domain/diagramTransfer'
import type { Diagram } from '../domain/types'
import { isNativePlatform } from './capacitor'

const EXPORT_PADDING = 64
const MAX_BITMAP_EDGE = 4096

export type DiagramExportSource = {
  viewport: HTMLElement
  nodes: Node[]
  backgroundColor: string
  viewportTransform?: { x: number; y: number; zoom: number }
}

export class DiagramExportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DiagramExportError'
  }
}

export function diagramFileName(name: string, extension: 'png' | 'pdf' | 'json') {
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

type ExportBounds = { x: number; y: number; width: number; height: number }

function unionBounds(bounds: ExportBounds[]): ExportBounds {
  const left = Math.min(...bounds.map((item) => item.x))
  const top = Math.min(...bounds.map((item) => item.y))
  const right = Math.max(...bounds.map((item) => item.x + item.width))
  const bottom = Math.max(...bounds.map((item) => item.y + item.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/** Include visual overflow that React Flow's model bounds do not know about. */
function renderedDiagramBounds(source: DiagramExportSource, modelBounds: ExportBounds) {
  const root = source.viewport.closest<HTMLElement>('.react-flow')
  const transform = source.viewportTransform
  if (!root || !transform || transform.zoom <= 0) return modelBounds

  const rootRect = root.getBoundingClientRect()
  const screenRects: DOMRect[] = Array.from(source.viewport.querySelectorAll<Element>([
    '.react-flow__node',
    '.chen-attribute-node__terminal',
    '.chen-cardinality-label',
    '.chen-connector-edge',
    '.chen-multivalue-fork',
  ].join(','))).map((element) => element.getBoundingClientRect())

  // An element's box does not grow when its text paints through
  // overflow:visible. Range geometry gives us the actual glyph bounds.
  source.viewport.querySelectorAll<HTMLElement>('.chen-node__label, .chen-cardinality-label').forEach((label) => {
    const range = document.createRange()
    range.selectNodeContents(label)
    screenRects.push(range.getBoundingClientRect())
  })

  const visualBounds = screenRects
    .filter((rect) => rect.width > 0 || rect.height > 0)
    .map((rect) => ({
      x: (rect.left - rootRect.left - transform.x) / transform.zoom,
      y: (rect.top - rootRect.top - transform.y) / transform.zoom,
      width: rect.width / transform.zoom,
      height: rect.height / transform.zoom,
    }))

  return visualBounds.length ? unionBounds([modelBounds, ...visualBounds]) : modelBounds
}

/** Capture the complete model bounds, regardless of the visible pan and zoom. */
export async function captureDiagramCanvas(source: DiagramExportSource) {
  if (source.nodes.length === 0) {
    throw new DiagramExportError('Añade al menos una entidad antes de exportar.')
  }

  await document.fonts?.ready

  const bounds = renderedDiagramBounds(source, getNodesBounds(source.nodes))
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

export type DiagramFileDestination = 'download' | 'documents'

export type DiagramFileResult = {
  fileName: string
  destination: DiagramFileDestination
  /** User-facing location, e.g. "Descargas" on web or "Documentos/…" on native. */
  locationLabel: string
  /** Native file URI (content://…) when saved through Capacitor Filesystem. */
  uri?: string
  shared: boolean
}

function webDownloadResult(fileName: string): DiagramFileResult {
  return { fileName, destination: 'download', locationLabel: 'Descargas', shared: false }
}

/**
 * Anchor downloads (blob: URLs + a[download]) silently do nothing inside the
 * Capacitor Android WebView, and jsPDF.save() relies on the same mechanism.
 * On native, persist through the Filesystem plugin so the file lands in a
 * user-visible folder, then let the caller surface the location + share sheet.
 */
async function persistBlob(blob: Blob, fileName: string): Promise<DiagramFileResult> {
  if (isNativePlatform()) {
    const { saveBlobToDocuments } = await import('./nativeFiles')
    try {
      const saved = await saveBlobToDocuments(blob, fileName)
      return {
        fileName: saved.fileName,
        destination: 'documents',
        locationLabel: saved.locationLabel,
        uri: saved.uri,
        shared: false,
      }
    } catch (error) {
      if (error instanceof Error && /permiso|permission/i.test(error.message)) {
        throw new DiagramExportError('Sin permiso para guardar en Documentos. Revisa los permisos de la app.')
      }
      throw error instanceof DiagramExportError
        ? error
        : new DiagramExportError('No se pudo guardar el archivo en el dispositivo.')
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  return webDownloadResult(fileName)
}

/** Open the OS share sheet for a file that was just saved on native. */
export async function shareExportedFile(result: DiagramFileResult, title: string): Promise<boolean> {
  if (!result.uri) return false
  const { shareSavedFile } = await import('./nativeFiles')
  const shared = await shareSavedFile(result.uri, title)
  if (shared) result.shared = true
  return shared
}

export async function downloadDiagramJson(diagram: Diagram): Promise<DiagramFileResult> {
  return persistBlob(
    new Blob([serializeDiagramFile(diagram)], { type: 'application/json;charset=utf-8' }),
    diagramFileName(diagram.name, 'json'),
  )
}

export async function downloadDiagramPng(
  canvas: HTMLCanvasElement,
  diagramName: string,
): Promise<DiagramFileResult> {
  return persistBlob(await canvasToBlob(canvas), diagramFileName(diagramName, 'png'))
}

export async function downloadDiagramPdf(
  canvas: HTMLCanvasElement,
  diagramName: string,
): Promise<DiagramFileResult> {
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
  const fileName = diagramFileName(diagramName, 'pdf')
  if (isNativePlatform()) {
    const pdfBlob = pdf.output('blob') as Blob
    return persistBlob(pdfBlob, fileName)
  }
  pdf.save(fileName)
  return webDownloadResult(fileName)
}

export type CopyImageOutcome =
  | { copied: true; sharedFile?: undefined }
  | { copied: false; sharedFile: DiagramFileResult }

/**
 * The Android WebView rarely grants image clipboard writes (missing
 * ClipboardItem support or denied clipboard permission). Try the clipboard
 * first, then fall back to saving the PNG and opening the share sheet so the
 * user can still send the image anywhere.
 */
export async function copyDiagramImage(
  canvas: HTMLCanvasElement,
  diagramName = 'diagrama',
): Promise<CopyImageOutcome> {
  const canUseClipboard = typeof navigator !== 'undefined'
    && Boolean(navigator.clipboard?.write)
    && typeof ClipboardItem !== 'undefined'
  if (canUseClipboard) {
    try {
      const blob = await canvasToBlob(canvas)
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      return { copied: true }
    } catch (error) {
      if (!isNativePlatform()) throw error
      // On native, fall through to the save + share fallback below.
    }
  } else if (!isNativePlatform()) {
    throw new DiagramExportError('Este navegador no permite copiar imágenes al portapapeles.')
  }

  const saved = await persistBlob(await canvasToBlob(canvas), diagramFileName(diagramName, 'png'))
  await shareExportedFile(saved, 'Compartir imagen del diagrama')
  return { copied: false, sharedFile: saved }
}

/** On native the clipboard fallback shares the file, so label the action honestly. */
export function copyActionLabel(): { title: string; hint: string } {
  if (isNativePlatform()) {
    return {
      title: 'Compartir como imagen',
      hint: 'Guarda el PNG y abre el menú para enviarlo',
    }
  }
  return { title: 'Copiar como imagen', hint: 'Pega el PNG en documentos o mensajes' }
}
