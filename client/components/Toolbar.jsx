function Btn({ onClick, active, disabled, title, children }) {
  return (
    <button
      type="button"
      className={`tb-btn ${active ? 'is-active' : ''}`}
      onMouseDown={(e) => e.preventDefault()} // keep editor selection
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const mod = isMac ? '⌘' : 'Ctrl';

export default function Toolbar({ editor, disabled }) {
  if (!editor) return <div className="toolbar" />;
  const chain = () => editor.chain().focus();

  const blockType = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p';

  function setBlock(value) {
    if (value === 'p') chain().setParagraph().run();
    else chain().setHeading({ level: Number(value.slice(1)) }).run();
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn title={`Undo (${mod}+Z)`} onClick={() => chain().undo().run()} disabled={disabled || !editor.can().undo()}>
        ↶
      </Btn>
      <Btn title={`Redo (${mod}+Shift+Z)`} onClick={() => chain().redo().run()} disabled={disabled || !editor.can().redo()}>
        ↷
      </Btn>
      <span className="tb-sep" />
      <select
        className="tb-select"
        value={blockType}
        onChange={(e) => setBlock(e.target.value)}
        disabled={disabled}
        aria-label="Text style"
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <span className="tb-sep" />
      <Btn title={`Bold (${mod}+B)`} active={editor.isActive('bold')} disabled={disabled} onClick={() => chain().toggleBold().run()}>
        <b>B</b>
      </Btn>
      <Btn title={`Italic (${mod}+I)`} active={editor.isActive('italic')} disabled={disabled} onClick={() => chain().toggleItalic().run()}>
        <i>I</i>
      </Btn>
      <Btn title={`Underline (${mod}+U)`} active={editor.isActive('underline')} disabled={disabled} onClick={() => chain().toggleUnderline().run()}>
        <u>U</u>
      </Btn>
      <Btn title="Strikethrough" active={editor.isActive('strike')} disabled={disabled} onClick={() => chain().toggleStrike().run()}>
        <s>S</s>
      </Btn>
      <span className="tb-sep" />
      <Btn title="Bulleted list" active={editor.isActive('bulletList')} disabled={disabled} onClick={() => chain().toggleBulletList().run()}>
        • ≡
      </Btn>
      <Btn title="Numbered list" active={editor.isActive('orderedList')} disabled={disabled} onClick={() => chain().toggleOrderedList().run()}>
        1. ≡
      </Btn>
      <Btn title="Quote" active={editor.isActive('blockquote')} disabled={disabled} onClick={() => chain().toggleBlockquote().run()}>
        ❝
      </Btn>
      <Btn title="Clear formatting" disabled={disabled} onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        T̸
      </Btn>
    </div>
  );
}
