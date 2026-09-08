export const NATIVE_EXPORT_DIR = 'Nightingale Schema'

export class NativeFileError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'NativeFileError'
  }
}

export type NativeSavedFile = {
  fileName: string
  uri: string
  /** User-facing location, e.g. "Documentos / Nightingale Schema / diagrama.png". */
  locationLabel: string
}

export function nativeLocationLabel(fileName: string): string {
  return `Documentos/${NATIVE_EXPORT_DIR}/${fileName}`
}

/** Blob -> raw base64 (no data: prefix), suitable for Filesystem.writeFile. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    try {
      const reader = new FileReader()
      reader.onerror = () => reject(new NativeFileError('No se pudo leer el archivo para guardarlo.'))
      reader.onload = () => {
        const result = reader.result
        if (typeof result !== 'string') {
          reject(new NativeFileError('No se pudo leer el archivo para guardarlo.'))
          return
        }
        const comma = result.indexOf(',')
        resolve(comma >= 0 ? result.slice(comma + 1) : result)
      }
      reader.readAsDataURL(blob)
    } catch {
      reject(new NativeFileError('No se pudo leer el archivo para guardarlo.'))
    }
  })
}

/**
 * Persist a blob where the user can find it on a native device.
 * Uses the public Documents folder so files survive app restarts and are
 * visible in the system file manager / Files app.
 */
export async function saveBlobToDocuments(blob: Blob, fileName: string): Promise<NativeSavedFile> {
  const { Filesystem, Directory } = await import('@capacitor/filesystem')
  const data = await blobToBase64(blob)
  const path = `${NATIVE_EXPORT_DIR}/${fileName}`
  const result = await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Documents,
    recursive: true,
  })
  let uri = result.uri
  if (!uri) {
    const resolved = await Filesystem.getUri({ path, directory: Directory.Documents })
    uri = resolved.uri
  }
  return { fileName, uri, locationLabel: nativeLocationLabel(fileName) }
}

/** Open the OS share sheet for an already-saved file. Returns true when opened. */
export async function shareSavedFile(uri: string, title: string, text?: string): Promise<boolean> {
  try {
    const { Share } = await import('@capacitor/share')
    const canShare = await Share.canShare().catch(() => ({ value: true }))
    if (canShare && 'value' in canShare && canShare.value === false) return false
    await Share.share({ title, text: text ?? title, url: uri, dialogTitle: title })
    return true
  } catch {
    // The user dismissing the sheet surfaces as a rejection on Android.
    return false
  }
}
