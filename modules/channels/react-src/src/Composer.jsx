import { useEffect, useRef, useState } from 'react';
import { fmtSize } from '../../../../core/react-src/src/shared/chat/media.js';
import { EMOJIS, buzz, displayName, toast } from './lib.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';
import useRecorder from '../../../../core/react-src/src/shared/chat/useRecorder.js';
import useOutside from '../../../../core/react-src/src/shared/useOutside.js';
import EmojiPicker from '../../../../core/react-src/src/shared/chat/EmojiPicker.jsx';

/* Поле ввода канала: вложения, эмодзи, упоминания, ответ и правка, запись
   голосового. Упоминания — часть модели каналов: @ник и @all адресуют
   уведомление конкретному человеку или всей группе. */
export default function Composer({
  members, reply, edit, files, setFiles, onSend, onUpload, onTyping,
  onCancelReply, onCancelEdit, inputRef,
}) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [mention, setMention] = useState(null);   // {list, matchLen}
  const emojiBtn = useRef(null);
  const emojiRef = useOutside(emojiOpen, () => setEmojiOpen(false), { ignore: emojiBtn });
  const { rec, start, stop } = useRecorder({
    onDone: (file) => onUpload([file], ''),
    onStart: (ok) => (ok ? buzz(20) : toast('Нет доступа к микрофону', 'error')),
  });

  useEffect(() => { setText(edit ? edit.text || '' : ''); }, [edit]);

  const grow = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; };

  /* Подсказка упоминаний: ищем @слово прямо перед курсором.

     Шаблон юникодный, а не \w: в прежней версии стоял \w, который кириллицу
     не считает буквой, — набрав «@Мы», подсказку было не получить, работал
     только латинский ник. */
  const checkMention = (el) => {
    const before = el.value.slice(0, el.selectionStart);
    const m = /@([\p{L}\p{N}_]*)$/u.exec(before);
    if (!m) { setMention(null); return; }
    const q = m[1].toLowerCase();
    const list = members
      .filter((x) => !q || displayName(x).toLowerCase().includes(q) || (x.username || '').toLowerCase().includes(q))
      .slice(0, 5);
    if (q === '' || 'all'.startsWith(q)) {
      list.unshift({ user_id: 'all', username: 'all', display_name: 'Все участники', role: 'common' });
    }
    setMention(list.length ? { list, matchLen: m[0].length } : null);
  };

  const insertMention = (username) => {
    const el = inputRef.current;
    const pos = el.selectionStart;
    const before = el.value.slice(0, pos - mention.matchLen);
    const after = el.value.slice(pos);
    const next = before + '@' + username + ' ' + after;
    setText(next);
    setMention(null);
    requestAnimationFrame(() => {
      el.focus();
      const p = before.length + username.length + 2;
      el.setSelectionRange(p, p);
    });
  };

  const pickFiles = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar';
    input.onchange = () => {
      const list = Array.from(input.files || []).slice(0, 7);
      if (!list.length) return;
      const entries = list.map((file) => ({ file, preview: null, isImage: /^image\//.test(file.type), key: file.name + file.size }));
      setFiles(entries);
      entries.forEach((entry) => {
        if (!entry.isImage) return;
        const r = new FileReader();
        r.onload = (e) => setFiles((cur) => cur.map((f) => (f.key === entry.key ? { ...f, preview: e.target.result } : f)));
        r.readAsDataURL(entry.file);
      });
    };
    input.click();
  };

  const hasContent = !!(text.trim() || files.length || reply || edit);

  const submit = () => {
    if (files.length) { onUpload(files.map((f) => f.file), text.trim()); setText(''); setFiles([]); return; }
    if (text.trim()) { onSend(text.trim()); setText(''); if (inputRef.current) inputRef.current.style.height = 'auto'; return; }
    start();
  };

  if (rec) {
    const m = Math.floor(rec.sec / 60);
    const s = String(rec.sec % 60).padStart(2, '0');
    return (
      <div className="ch-record-bar" style={{ display: 'flex' }}>
        <div className="ch-rec-dot" />
        <span className="ch-rec-time">{m}:{s}</span>
        <div style={{ flex: 1 }} />
        <button className="ch-rec-cancel" onClick={() => stop(false)}>Отмена</button>
        <button className="ch-rec-send" onClick={() => stop(true)}>
          <span className="ico ico-18 ico-send" style={{ backgroundColor: 'var(--accent)' }} />
        </button>
      </div>
    );
  }

  return (
    <>
      {mention && (
        <div className="ch-mention-popup" style={{ display: 'block' }}>
          {mention.list.map((x) => (
            <div className="ch-mention-item" key={x.user_id} onClick={() => insertMention(x.username)}>
              <Avatar cls="ch-mention-ava" src={x.avatar} name={displayName(x)} />
              <span className="ch-mention-name">{displayName(x)}</span>
              <span className={'role-badge ' + x.role} style={{ fontSize: 8, padding: '1px 4px' }}>{(x.role || '').toUpperCase()}</span>
            </div>
          ))}
        </div>
      )}

      {reply && !edit && (
        <div className="ch-reply-bar" style={{ display: 'flex' }}>
          <span className="ch-bar-icon ico ico-16 ico-reply" />
          <div className="ch-reply-info">
            <span className="ch-reply-name">{reply.from_name || reply.from}</span>
            <span className="ch-reply-text">{(reply.text || '').slice(0, 100)}</span>
          </div>
          <button className="ch-reply-close" onClick={onCancelReply}><span className="ico ico-14 ico-close" /></button>
        </div>
      )}

      {edit && (
        <div className="ch-reply-bar" style={{ display: 'flex' }}>
          <span className="ch-bar-icon ico ico-16 ico-pencil" />
          <div className="ch-reply-info">
            <span className="ch-reply-name">Изменение сообщения</span>
            <span className="ch-reply-text">{(edit.text || '').slice(0, 100)}</span>
          </div>
          <button className="ch-reply-close" onClick={onCancelEdit}><span className="ico ico-14 ico-close" /></button>
        </div>
      )}

      {files.length > 0 && (
        <div className="ch-upload-preview" style={{ display: 'block' }}>
          <div className="ch-upload-items">
            {files.map((f, i) => (f.isImage && f.preview ? (
              <div className="ch-upload-thumb" key={f.key}>
                <div className="ch-upload-thumb-inner"><img src={f.preview} alt="" /></div>
                <button className="ch-upload-x" onClick={() => setFiles((c) => c.filter((_, k) => k !== i))}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ) : (
              <div className="ch-upload-file" key={f.key}>
                <div className="ch-upload-file-icon">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /></svg>
                </div>
                <div className="ch-upload-file-meta">
                  <div className="ch-upload-fname">{f.file.name}</div>
                  <div className="ch-upload-fsize">{fmtSize(f.file.size)}</div>
                </div>
                <button className="ch-upload-x" onClick={() => setFiles((c) => c.filter((_, k) => k !== i))}>
                  <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            )))}
          </div>
        </div>
      )}

      {emojiOpen && (
        <EmojiPicker
          emojis={EMOJIS} cls="ch-emoji-picker" itemCls="ch-emoji-item" innerRef={emojiRef}
          onPick={(e) => { setText((t) => t + e); if (inputRef.current) inputRef.current.focus(); }}
        />
      )}

      <div className="ch-input-area" style={{ display: 'flex' }}>
        <button className="ch-attach-btn" onClick={pickFiles}>
          <span className="ico ico-18 ico-attach" style={{ backgroundColor: '#999' }} />
        </button>
        <button className="ch-emoji-btn" ref={emojiBtn} onClick={() => setEmojiOpen((v) => !v)}>
          <span className="ico ico-18 ico-emoji" style={{ backgroundColor: '#999' }} />
        </button>
        <textarea
          className="ch-input" placeholder="Написать сообщение..." rows={1} maxLength={4000} ref={inputRef}
          value={text}
          onChange={(e) => { setText(e.target.value); grow(e.target); onTyping(); checkMention(e.target); }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setMention(null); if (edit) onCancelEdit(); }
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
        />
        <button className="ch-send-btn" onClick={submit}>
          <span
            className={'ico ico-18 ' + (hasContent ? 'ico-send' : 'ico-mic')}
            style={{ backgroundColor: hasContent ? 'var(--accent)' : 'var(--text-dim)' }}
          />
        </button>
      </div>
    </>
  );
}
