import { useEffect, useState } from 'react';
import { attUrl, toast } from './lib.js';

/* Один проигрыватель на весь модуль: запуск нового трека останавливает
   предыдущий. Раньше состояние жило в DOM (классы .playing, подмена иконки,
   перекраска столбиков вручную), и рассинхронизировалось при перерисовке
   ленты. Здесь это обычное состояние, на которое подписаны сами плееры. */

let audio = null;
let current = null; // {id, state:'load'|'play'|'pause', t, dur}
const subs = new Set();

function emit() { subs.forEach((fn) => fn(current)); }

function stop() {
  if (audio) { audio.pause(); audio.src = ''; audio = null; }
  current = null;
  emit();
}

export function toggleAudio(id) {
  if (current && current.id === id && audio) {
    if (audio.paused) { audio.play(); current = { ...current, state: 'play' }; }
    else { audio.pause(); current = { ...current, state: 'pause' }; }
    emit();
    return;
  }
  stop();
  audio = new Audio(attUrl(id));
  audio.preload = 'auto';
  current = { id, state: 'load', t: 0, dur: 0 };
  emit();

  audio.oncanplay = () => {
    if (!audio) return;
    current = { id, state: 'play', t: 0, dur: audio.duration || 0 };
    emit();
    audio.play();
  };
  audio.ontimeupdate = () => {
    if (!audio || !audio.duration) return;
    current = { id, state: audio.paused ? 'pause' : 'play', t: audio.currentTime, dur: audio.duration };
    emit();
  };
  audio.onended = stop;
  audio.onerror = () => { stop(); toast('Ошибка воспроизведения', 'error'); };
}

export function seekAudio(id, pct) {
  if (!audio || !current || current.id !== id || !audio.duration) return;
  audio.currentTime = Math.max(0, Math.min(1, pct)) * audio.duration;
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
