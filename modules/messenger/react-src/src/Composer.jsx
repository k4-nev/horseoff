import { useEffect, useRef, useState } from 'react';
import { EMOJIS, fmtDuration, fmtSize, mediaType, rejectFile, toast } from './lib.js';

/* Поле ввода со всем, что к нему прилипает: эмодзи, вложения, полоска
   ответа/пересылки/правки и запись голосового.

   Запись раньше жила в полях объекта модуля и чистилась вручную из четырёх
   мест; здесь поток и таймер снимаются при размонтировании. */

function useRecorder(onDone) {
  const [rec, setRec] = useState(null); // {sec}
  const mr = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const chunks = useRef([]);
  const secs = useRef(0);

  const cleanup = () => {
    clearInterval(timer.current);
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    mr.current = null; stream.current = null; chunks.current = []; secs.current = 0;
    setRec(null);
  };

  useEffect(() => () => cleanup(), []);

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      secs.current = 0;
      let opt = { mimeType: 'audio/webm;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(opt.mimeType)) opt = { mimeType: 'audio/ogg;codecs=opus' };
      if (!MediaRecorder.isTypeSupported(opt.mimeType)) opt = {};
      const r = new MediaRecorder(s, opt);
      mr.current = r; stream.current = s;
      r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
      r.start(100);
      setRec({ sec: 0 });
      timer.current = setInterval(() => {
        secs.current += 1;
        setRec({ sec: secs.current });
        if (secs.current >= 180) stopSend();
      }, 1000);
    } catch (e) {
      toast('Нет доступа к микрофону', 'error');
      cleanup();
    }
  };

  const stopSend = () => {
    const r = mr.current;
    if (!r) return;
    const duration = secs.current;
    r.onstop = () => {
      const blob = new Blob(chunks.current, { type: r.mimeType || 'audio/webm' });
      cleanup();
      if (blob.size < 500 || duration < 1) return;
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm';
      const file = new File([blob], 'voice_' + Date.now() + '_' + duration + 's.' + ext, { type: blob.type });
      onDone([{ file, mediaType: 'audio', preview: null, unsupported: false }]);
    };
    try { r.stop(); } catch (e) { cleanup(); }
  };

  const cancel = () => { try { if (mr.current) mr.current.stop(); } catch (e) { /* уже остановлен */ } cleanup(); };

  return { rec, start, stopSend, cancel };
}

const TrashIco = () => (
  <svg width="16" height="16" viewBox="19 16 55 60" fill="currentColor">
    <path d="M67.305,36.442v-8.055c0-.939-.762-1.701-1.7-1.701H54.342v-5.524c0-.938-.761-1.7-1.699-1.7h-12.75c-.939,0-1.701.762-1.701,1.7v5.524H26.93c-.939,0-1.7.762-1.7,1.701v8.055c0,.938.761,1.699,1.7,1.699h.488v34.021c0,.938.761,1.7,1.699,1.7h29.481c3.595,0,6.52-2.924,6.52-6.518V38.142h.486C66.543,38.142,67.305,37.381,67.305,36.442z M41.592,22.862h9.35v3.824h-9.35V22.862z M61.719,67.345c0,1.719-1.4,3.117-3.12,3.117h-27.78v-32.32l30.9.002V67.345z M63.904,34.742H28.629v-4.655h11.264h12.75h11.262V34.742z" />
    <rect height="19.975" width="3.4" x="36.066" y="44.962" />
    <rect height="19.975" width="3.4" x="44.566" y="44.962" />
    <rect height="19.975" width="3.4" x="53.066" y="44.962" />
  </svg>
);

export default function Composer({
  files, setFiles, reply, edit, forward,
  onCancelReply, onCancelEdit, onCancelForward,
  onSend, onTyping, inputRef, onHeight,
}) {
  const [text, setText] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const fileRef = useRef(null);
  const emojiRef = useRef(null);

  const { rec, start, stopSend, cancel } = useRecorder((voiceFiles) => onSend('', voiceFiles));

  /* Правка подставляет текст в поле — как было */
  useEffect(() => { if (edit) setText(edit.text || ''); }, [edit]);

  useEffect(() => {
    if (!emojiOpen) return undefined;
    const onDoc = (e) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target)) setEmojiOpen(false);
    };
    document.addEventListener('click', onDoc);
    return () => document.removeEventListener('click', onDoc);
  }, [emojiOpen]);

  const grow = (el) => { el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 120) + 'px'; };

  const addFiles = (list) => {
    const next = [...files];
    Array.from(list).forEach((file) => {
      const why = rejectFile(file, next);
      if (why) { toast(why, 'error'); return; }
      const t = mediaType(file.name);
      const entry = { file, mediaType: t, preview: t === 'video' ? '🎬' : null, unsupported: t === 'unknown', key: file.name + file.size + file.lastModified };
      if (t === 'image') {
        const r = new FileReader();
        r.onload = (e) => setFiles((cur) => cur.map((f) => (f.key === entry.key ? { ...f, preview: e.target.result } : f)));
        r.readAsDataURL(file);
      }
      next.push(entry);
    });
    setFiles(next);
  };

  const hasUnsupported = files.some((f) => f.unsupported);
  const hasContent = !!(text.trim() || files.length || reply || edit || forward);

  const submit = () => {
    if (rec) { stopSend(); return; }
    if (!hasContent) { start(); return; }
    if (hasUnsupported) return;
    onSend(text, files);
    setText('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
  };

  const bar = edit ? null : (reply || forward);

  /* Лента отступает снизу ровно на высоту поля ввода: оно растёт от полоски
     ответа, превью вложений и многострочного текста, а на iOS ещё и от
     safe-area — с фиксированным отступом последнее сообщение уходило под него. */
  const rootRef = useRef(null);
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return undefined;
    const report = () => onHeight && onHeight(el.offsetHeight);
    report();
    if (!window.ResizeObserver) return undefined;
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onHeight]);

  return (
    <div className="msg-input-area" ref={rootRef}>
      {emojiOpen && (
        <div className="msg-emoji-picker" style={{ display: 'grid' }} ref={emojiRef}>
          {EMOJIS.map((e) => (
            <div className="msg-emoji-item" key={e} onClick={() => { setText((t) => t + e); inputRef.current && inputRef.current.focus(); }}>{e}</div>
          ))}
        </div>
      )}

      {files.length > 0 && (
        <div className="msg-attach-preview" style={{ display: 'flex' }}>
          {files.map((f, i) => {
            const x = (
              <button className="msg-attach-remove" title="Убрать" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            );
            if (f.mediaType === 'image' && f.preview) {
              return (
                <div className={'msg-attach-item' + (f.unsupported ? ' unsupported' : '')} key={f.key}>
                  <div className="msg-attach-item-inner"><img src={f.preview} alt="" /></div>{x}
                </div>
              );
            }
            const meta = f.unsupported ? 'не поддерж.'
              : f.mediaType === 'video' ? 'Видео · ' + fmtSize(f.file.size)
                : f.mediaType === 'audio' ? 'Аудио · ' + fmtSize(f.file.size)
                  : fmtSize(f.file.size);
            return (
              <div className={'msg-attach-item msg-attach-is-file' + (f.unsupported ? ' unsupported' : '')} key={f.key}>
                <div className="msg-attach-file-icon-wrap">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
                <div className="msg-attach-file-meta">
                  <div className="msg-attach-fname">{f.file.name}</div>
                  <div className="msg-attach-fsize">{meta}</div>
                </div>
                {x}
              </div>
            );
          })}
        </div>
      )}

      {bar && (
        <div className="msg-action-bar-wrap" style={{ display: 'block' }}>
          <div className={'msg-action-bar ' + (forward ? 'forward' : 'reply')}>
            <div className={'msg-action-bar-line ' + (forward ? 'forward' : 'reply')} />
            <div className="msg-action-bar-content">
              <div className="msg-action-bar-label">
                {forward ? 'Переслать сообщение' : <>В ответ <b>{reply.from_name}</b></>}
              </div>
              <div className="msg-action-bar-text">{forward ? forward.preview : reply.text}</div>
            </div>
            <button className="msg-action-bar-close" onClick={forward ? onCancelForward : onCancelReply}>×</button>
          </div>
        </div>
      )}

      {edit && (
        <div className="msg-edit-bar" style={{ display: 'flex' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" /></svg>
          <span>Редактирование</span>
          <button className="msg-edit-cancel" onClick={() => { onCancelEdit(); setText(''); }}>✕</button>
        </div>
      )}

      <button className="msg-emoji-btn" onClick={(e) => { e.stopPropagation(); setEmojiOpen((v) => !v); }}>
        <span className="ico ico-20 ico-emoji" />
      </button>
      <button className="msg-attach-btn" onClick={() => fileRef.current && fileRef.current.click()} title="Прикрепить">
        <span className="ico ico-18 ico-attach" />
      </button>
      <input
        type="file" ref={fileRef} multiple style={{ display: 'none' }}
        accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.rar,.txt"
        onChange={(e) => { if (e.target.files.length) addFiles(e.target.files); e.target.value = ''; }}
      />

      {!rec && (
        <textarea
          className="msg-input" ref={inputRef} rows="1" maxLength="4000" placeholder="Сообщение..."
          value={text}
          autoComplete="off" autoCorrect="off" autoCapitalize="sentences" spellCheck="true"
          data-form-type="other" data-lpignore="true" name="messenger-chat-input-xxxx"
          onChange={(e) => { setText(e.target.value); grow(e.target); onTyping(); }}
          onPaste={(e) => {
            const items = e.clipboardData && e.clipboardData.items;
            if (!items) return;
            const fl = [];
            for (let i = 0; i < items.length; i++) if (items[i].kind === 'file') fl.push(items[i].getAsFile());
            if (fl.length) { e.preventDefault(); addFiles(fl); }
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
            if (e.key === 'Escape') { if (edit) { onCancelEdit(); setText(''); } onCancelReply(); onCancelForward(); }
          }}
        />
      )}

      {rec && (
        <div className="msg-record-inline" style={{ display: 'flex' }}>
          <button className="msg-record-trash" onClick={cancel}><TrashIco /></button>
          <span className="msg-record-dot active" />
          <span className="msg-record-time">{fmtDuration(rec.sec)}</span>
        </div>
      )}

      <button
        className={'msg-send-btn ico ' + (rec ? 'recording ico-send' : hasContent ? 'has-content ico-send' : 'mic-idle ico-mic')}
        disabled={hasUnsupported}
        style={hasUnsupported ? { opacity: 0.3, pointerEvents: 'none' } : undefined}
        onClick={submit}
      />
    </div>
  );
}
