import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { X } from 'lucide-react'

type ViewportFrame = {
  height: number
  offsetTop: number
}

function readViewportFrame(): ViewportFrame {
  if (typeof window === 'undefined') return { height: 0, offsetTop: 0 }
  const viewport = window.visualViewport
  return {
    height: Math.round(viewport?.height ?? window.innerHeight),
    offsetTop: Math.round(viewport?.offsetTop ?? 0),
  }
}

/**
 * Track the visual viewport rather than the layout viewport. Mobile browsers
 * can leave the layout viewport at full height while the keyboard shrinks or
 * shifts the visual viewport; the dialog must follow the latter.
 */
function useViewportFrame(): ViewportFrame {
  const [frame, setFrame] = useState<ViewportFrame>(readViewportFrame)

  useEffect(() => {
    const update = () => setFrame((current) => {
      const next = readViewportFrame()
      return current.height === next.height && current.offsetTop === next.offsetTop ? current : next
    })
    const viewport = window.visualViewport
    update()
    window.addEventListener('resize', update)
    viewport?.addEventListener('resize', update)
    viewport?.addEventListener('scroll', update)
    return () => {
      window.removeEventListener('resize', update)
      viewport?.removeEventListener('resize', update)
      viewport?.removeEventListener('scroll', update)
    }
  }, [])

  return frame
}

export function DialogScreen({ title, children, onClose }: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  const viewport = useViewportFrame()
  const style = {
    '--dialog-viewport-height': `${viewport.height}px`,
    '--dialog-viewport-top': `${viewport.offsetTop}px`,
  } as CSSProperties

  const closeFromBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.currentTarget === event.target) onClose()
  }

  return (
    <div className="dialog-backdrop" style={style} onMouseDown={closeFromBackdrop}>
      <section className="dialog-screen" role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-handle" aria-hidden="true" />
        <header className="dialog-header">
          <h2>{title}</h2>
          <button type="button" className="close-button" onClick={onClose} aria-label="Cerrar">
            <X size={19} />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </section>
    </div>
  )
}
