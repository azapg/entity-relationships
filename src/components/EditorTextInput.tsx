import { forwardRef, type InputHTMLAttributes } from 'react'

type EditorTextInputProps = InputHTMLAttributes<HTMLInputElement>

/** Text fields in the editor are names, not prose; browser suggestions only
 * consume space on mobile and make repeated diagram entry harder. */
export const EditorTextInput = forwardRef<HTMLInputElement, EditorTextInputProps>(function EditorTextInput(props, ref) {
  return (
    <input
      {...props}
      ref={ref}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
    />
  )
})
