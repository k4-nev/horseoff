import { useEffect, useState } from 'react';
import { attUrl, toast } from './lib.js';

/* Один проигрыватель на весь модуль: запуск нового трека останавливает
   предыдущий. Раньше состояние жило в DOM (классы .playing, подмена иконки,
   перекраска столбиков вручную), и рассинхронизировалось при перерисовке
   ленты. Здесь это обычное состояние, на которое подписаны сами плееры. */

let audio = null;
let current = null; // {id, state:'load'|'play'|'pause', t, dur}
let pendingSeek = 0;  // куда встать, когда трек догрузится
const subs = new Set();

function emit() { subs.forEach((fn) => fn(current)); }

/* Снять элемент с эфира. Обработчики сбрасываем ДО остановки: пустой src —
   это ошибка загрузки с точки зрения браузера, и прежний onerror показывал
   «Ошибка воспроизведения» после каждого доигравшего голосового. */
function stop() {
  if (audio) {
    audio.onended = null; audio.onerror = null; audio.oncanplay = null; audio.ontimeupdate = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    audio = null;
  }
  current = null;
  pendingSeek = 0;
  emit();
}

function play() {
  if (!audio) return;
  const pr = audio.play();
  // Автозапуск браузер может отклонить — это не ошибка файла, молчим
  if (pr && pr.catch) pr.catch(() => {});
}

function start(id, seek) {
  stop();
  pendingSeek = seek || 0;
  audio = new Audio(attUrl(id));
  audio.preload = 'auto';
  current = { id, state: 'load', t: 0, dur: 0 };
  emit();

  audio.oncanplay = () => {
    if (!audio) return;
    if (pendingSeek > 0 && audio.duration) {
      audio.currentTime = pendingSeek * audio.duration;
      pendingSeek = 0;
    }
    current = { id, state: 'play', t: audio.currentTime, dur: audio.duration || 0 };
    emit();
    play();
  };
  audio.ontimeupdate = () => {
    if (!audio || !audio.duration) return;
    current = { id, state: audio.paused ? 'pause' : 'play', t: audio.currentTime, dur: audio.duration };
    emit();
  };
  audio.onended = stop;
  audio.onerror = () => { stop(); toast('Ошибка воспроизведения', 'error'); };
}

export function toggleAudio(id) {
  if (current && current.id === id && audio) {
    if (audio.paused) { play(); current = { ...current, state: 'play' }; }
    else { audio.pause(); current = { ...current, state: 'pause' }; }
    emit();
    return;
  }
  start(id, 0);
}

/** Перемотка по волне. По ещё не запущенному треку — запуск с этого места. */
export function seekAudio(id, pct) {
  const at = Math.max(0, Math.min(1, pct));
  if (!audio || !current || current.id !== id) { start(id, at); return; }
  if (!audio.duration) { pendingSeek = at; return; }
  audio.currentTime = at * audio.duration;
  current = { ...current, t: audio.currentTime };
  emit();
}

export function stopAudio() { stop(); }

/** Состояние проигрывания конкретного вложения. */
export function useAudio(id) {
  const [st, setSt] = useState(() => (current && current.id === id ? current : null));
  useEffect(() => {
    const fn = (c) => setSt(c && c.id === id ? c : null);
    subs.add(fn);
    fn(current);
    return () => subs.delete(fn);
  }, [id]);
  return st;
}
