import React, { useRef, useCallback } from 'react'

interface Props {
  value: string
  onChange: (html: string) => void
}

const EMOJIS = ['😀','😁','😂','🤣','😃','😄','😅','😆','😉','😊','😋','😎','😍','😘','🥰','😗','😙','😚','🤗','🤔','🤭','🤫','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🥳','😎','🤓','🧐','😕','😟','🙁','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭','😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','👋','🤚','🖐','✋','🖖','👌','🤏','✌','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏','✍','💅','🤳','💪','🦵','🦶','👂','🦻','👃','🧠','🦷','🦴','👀','👁','👅','👄','💋','❤','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣','💕','💞','💓','💗','💖','💘','💝','💟','☮','✝','☪','☸','✡','☯','🕎','🔯','⭐','🌟','✨','💫','⚡','🔥','💥','💦','💨','☀','🌤','⛅','🌥','☁','🌧','⛈','🌩','🌨','☔','☂','🌪','🌫','🌈','😀']

export default function RichEditor({ value, onChange }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [showEmoji, setShowEmoji] = React.useState(false)

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
    editorRef.current?.focus()
  }

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }, [onChange])

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  const insertImage = () => {
    fileRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      exec('insertImage', reader.result as string)
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const insertTable = () => {
    const rows = prompt('行数:', '3') || '3'
    const cols = prompt('列数:', '3') || '3'
    document.execCommand('insertTable', false, `${rows}x${cols}`)
    if (editorRef.current) onChange(editorRef.current.innerHTML)
  }

  const insertEmoji = (emoji: string) => {
    exec('insertText', emoji)
    setShowEmoji(false)
  }

  return (
    <div className="rich-editor">
      <div className="rich-toolbar">
        <button type="button" className="rt-btn" onClick={() => exec('bold')} title="加粗"><strong>B</strong></button>
        <button type="button" className="rt-btn" onClick={() => exec('italic')} title="斜体"><em>I</em></button>
        <button type="button" className="rt-btn" onClick={() => exec('underline')} title="下划线"><u>U</u></button>
        <button type="button" className="rt-btn" onClick={() => exec('strikeThrough')} title="删除线"><s>S</s></button>
        <span className="rt-sep" />
        <button type="button" className="rt-btn" onClick={() => exec('formatBlock', '<h2>')} title="标题">H</button>
        <button type="button" className="rt-btn" onClick={() => exec('formatBlock', '<p>')} title="正文">P</button>
        <span className="rt-sep" />
        <button type="button" className="rt-btn" onClick={() => exec('insertUnorderedList')} title="无序列表">•</button>
        <button type="button" className="rt-btn" onClick={() => exec('insertOrderedList')} title="有序列表">1.</button>
        <span className="rt-sep" />
        <button type="button" className="rt-btn" onClick={insertTable} title="插入表格">▦</button>
        <button type="button" className="rt-btn" onClick={insertImage} title="插入图片">🖼</button>
        <div className="rt-emoji-wrap">
          <button type="button" className="rt-btn" onClick={() => setShowEmoji(!showEmoji)} title="表情">😀</button>
          {showEmoji && (
            <div className="rt-emoji-panel">
              {EMOJIS.map((e, i) => (
                <button key={i} type="button" className="rt-emoji-item" onClick={() => insertEmoji(e)}>{e}</button>
              ))}
            </div>
          )}
        </div>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>
      <div
        ref={editorRef}
        className="rich-editor-content"
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        dangerouslySetInnerHTML={{ __html: value }}
      />
    </div>
  )
}
