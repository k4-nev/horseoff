import { useEffect, useRef, useState } from 'react';

/* Запись голосового сообщения.

   Один и тот же MediaRecorder с таймером, отменой и сборкой файла жил в двух
   композерах — «Сообщений» и «Каналов». Копии успели разойтись: одна умела
   запасной кодек ogg и обрывала запись на трёх минутах, другая — нет.
   Здесь собрано лучшее из обеих.

   Наружу отдаётся File: во что его заворачивать дальше — дело модуля, у них
   разные форматы вложений. */

const MIMES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'];

export default function useRecorder({ onDone, maxSec = 180, onStart }) {
  const [rec, setRec] = useState(null);   // {sec} пока идёт запись, иначе null
  const mr = useRef(null);
  const stream = useRef(null);
  const timer = useRef(null);
  const chunks = useRef([]);
  const secs = useRef(0);
  const keep = useRef(true);
  const done = useRef(onDone);
  done.current = onDone;

  const cleanup = () => {
    clearInterval(timer.current);
    if (stream.current) stream.current.getTracks().forEach((t) => t.stop());
    mr.current = null;
    stream.current = null;
    chunks.current = [];
    secs.current = 0;
    setRec(null);
  };
  useEffect(() => () => cleanup(), []);

  const stop = (send) => {
    keep.current = send !== false;
    const r = mr.current;
    if (r && r.state === 'recording') { try { r.stop(); } catch (e) { cleanup(); } } else cleanup();
  };
  const stopRef = useRef(stop);
  stopRef.current = stop;

  const start = async () => {
    let s;
    try {
      s = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      if (onStart) onStart(false);
      return;
    }
    chunks.current = [];
    secs.current = 0;
    keep.current = true;
    const mime = MIMES.find((m) => MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(s, mime ? { mimeType: mime } : {});
    r.ondataavailable = (e) => { if (e.data.size > 0) chunks.current.push(e.data); };
    r.onstop = () => {
      const dur = secs.current;
      const send = keep.current;
      const type = r.mimeType || 'audio/webm';
      const blob = new Blob(chunks.current, { type });
      cleanup();
      // Меньше секунды или пустой блоб — это случайное касание, а не сообщение
      if (!send || dur < 1 || blob.size < 500) return;
      const ext = type.indexOf('ogg') !== -1 ? 'ogg' : 'webm';
      done.current(new File([blob], 'voice_' + Date.now() + '_' + dur + 's.' + ext, { type }));
    };
    mr.current = r;
    stream.current = s;
    r.start(100);
    setRec({ sec: 0 });
    timer.current = setInterval(() => {
      secs.current += 1;
      setRec({ sec: secs.current });
      if (secs.current >= maxSec) stopRef.current(true);
    }, 1000);
    if (onStart) onStart(true);
  };

  return { rec, start, stop };
}
