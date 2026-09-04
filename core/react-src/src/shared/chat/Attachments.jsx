import { seekAudio, toggleAudio, useAudio } from './audio.js';
import { MEDIA_W, WAVE_H, attUrl, fmtDuration, fmtSize, isVoiceFile, layoutMedia } from './media.js';
import './attachments.css';

/* Вложения сообщения: пачка фото и видео, голосовое, трек, файл.

   Общее для «Сообщений» и «Каналов». Раньше это были две независимые
   реализации на строках HTML: в мессенджере одна, в каналах другая, с теми
   же ошибками по отдельности — например, перемотка, которая не работала,
   пока трек не запущен.

   Внешний вид настраивается переменными --chat-* на контейнере модуля,
   разметка одна. */

const PlayIco = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>;
const PauseIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
  </svg>
);
const LoadIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="ho-spin">
    <path d="M12 3a9 9 0 1 0 9 9" opacity="0.85" />
  </svg>
);

function Wave({ id, count, pct, tone }) {
  const played = Math.round((pct / 100) * count);
  return (
    <div
      className="ho-audio-wave"
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        seekAudio(id, (e.clientX - r.left) / r.width);
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={'ho-audio-bar' + (i < played ? ' on' : '')}
          style={{ height: WAVE_H[i % WAVE_H.length] + 'px', background: i < played ? tone.played : tone.rest }}
        />
      ))}
    </div>
  );
}

export function AudioPlayer({ a }) {
  const st = useAudio(a.id);
  const voice = isVoiceFile(a);
  const playing = st && st.state === 'play';
  const pct = st && st.dur ? (st.t / st.dur) * 100 : 0;
  const tone = { played: 'var(--chat-accent, var(--accent))', rest: voice ? 'var(--chat-wave-rest, #d2dae3)' : 'var(--border)' };

  const label = st && st.dur
    ? fmtDuration(Math.round(st.t)) + ' / ' + fmtDuration(Math.round(st.dur))
    : (a.duration ? fmtDuration(a.duration) : '0:00');

  const btn = (ring) => (
    <button className="ho-audio-btn" onClick={(e) => { e.stopPropagation(); toggleAudio(a.id); }}>
      {ring && <span className="ho-audio-ring" style={{ '--pct': (pct / 100).toFixed(3) + 'turn' }} />}
      <span className="ho-audio-icon">
        {!st ? <PlayIco /> : st.state === 'load' ? <LoadIco /> : playing ? <PauseIco /> : <PlayIco />}
      </span>
    </button>
  );

  /* Голосовое: прогресс идёт и по кольцу вокруг кнопки, и по волне —
     кольцо отвечает на «сколько осталось», волна на «где я сейчас». */
  if (voice) {
    return (
      <div className={'ho-audio ho-audio--voice' + (playing ? ' playing' : '')}>
        {btn(true)}
        <Wave id={a.id} count={36} pct={pct} tone={tone} />
        <span className="ho-audio-time">{label}</span>
      </div>
    );
  }

  /* Музыка: обложка, название, формат с размером и дорожка. Волна тут врала
     бы — содержимое трека мы не знаем. */
  let name = a.name ? a.name.replace(/\.[^.]+$/, '') : '';
  if (name.length > 30) name = name.slice(0, 28) + '...';
  const ext = (a.name || '').split('.').pop().toUpperCase().slice(0, 4);

  return (
    <div className={'ho-audio ho-audio--track' + (playing ? ' playing' : '')}>
      <div className="ho-track-cover">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 4.5v10.2a3.1 3.1 0 1 1-1.7-2.76V7.2l-7.6 1.5v8.3a3.1 3.1 0 1 1-1.7-2.76V6.3z" />
        </svg>
      </div>
      <div className="ho-audio-info">
        <div className="ho-audio-name-row">
          <span className="ho-audio-name">{name}</span>
          <span className="ho-audio-time">{label}</span>
        </div>
        <div className="ho-track-meta">{ext}{a.size ? ' · ' + fmtSize(a.size) : ''}</div>
        <div
          className="ho-track-line"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            seekAudio(a.id, (e.clientX - r.left) / r.width);
          }}
        >
          <i style={{ width: pct + '%' }} />
        </div>
      </div>
      {btn(false)}
    </div>
  );
}

export function FileCard({ a }) {
  const ext = (a.name || '').split('.').pop().toUpperCase().slice(0, 4);
  return (
    <a className="ho-att-file" href={attUrl(a.id)} download={a.name} onClick={(e) => e.stopPropagation()}>
      <span className="ho-att-file-icon">{ext}</span>
      <div className="ho-att-file-info">
        <div className="ho-att-file-name">{a.name}</div>
        <div className="ho-att-file-size">{fmtSize(a.size)}</div>
      </div>
    </a>
  );
}

/**
 * Вложения одного сообщения.
 * onOpenMedia(list, index) — открыть просмотрщик на нужной позиции пачки.
 */
export default function Attachments({ items, onOpenMedia, shown = 6, width = MEDIA_W }) {
  if (!items || !items.length) return null;
  const audios = items.filter((a) => a.type === 'audio');
  const files = items.filter((a) => a.type === 'file');
  const media = items.filter((a) => a.type === 'image' || a.type === 'video');

  const visible = media.slice(0, shown);
  const rest = media.length - visible.length;
  const rows = visible.length ? layoutMedia(visible, width) : [];
  let idx = -1;

  return (
    <>
      {media.length > 0 && (
        <div className="ho-att-grid" style={{ width }}>
          {rows.map((cells, ri) => (
            <div className="ho-att-row" key={ri}>
              {cells.map(({ item: a, w, h }) => {
                idx += 1;
                const k = idx;
                return (
                  <div
                    className={'ho-att-thumb' + (a.type === 'video' ? ' ho-att-video' : '')}
                    key={a.id}
                    style={{ width: w, height: h }}
                    onClick={() => onOpenMedia(media, k)}
                  >
                    <img src={a._localUrl || attUrl(a.id, '/thumb')} loading="lazy" alt="" />
                    {a.type === 'video' && (
                      <div className="ho-video-overlay">
                        <div className="ho-video-play">
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L19 12z" /></svg>
                        </div>
                        {a.duration ? <span className="ho-video-dur">{fmtDuration(a.duration)}</span> : null}
                      </div>
                    )}
                    {rest > 0 && k === visible.length - 1 && <div className="ho-att-more">+{rest}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {audios.map((a) => <AudioPlayer key={a.id} a={a} />)}
      {files.map((a) => <FileCard key={a.id} a={a} />)}
    </>
  );
}
