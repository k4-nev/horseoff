import { seekAudio, toggleAudio, useAudio } from './audio.js';
import { MEDIA_W, WAVE_H, attUrl, fmtDuration, fmtSize, layoutMedia } from './lib.js';

/* Вложения сообщения: сетка фото и видео, проигрыватель аудио, файлы. */

const PlayIco = () => <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 5v14l12-7z" /></svg>;
const PauseIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <rect x="6.5" y="5" width="3.6" height="14" rx="1.2" />
    <rect x="13.9" y="5" width="3.6" height="14" rx="1.2" />
  </svg>
);
const LoadIco = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className="msg-loading-spin">
    <path d="M12 3a9 9 0 1 0 9 9" opacity="0.85" />
  </svg>
);

function Wave({ id, count, pct, mine, voice }) {
  const played = Math.round((pct / 100) * count);
  const cPlayed = mine && voice ? '#fff' : 'var(--accent)';
  const cRest = mine && voice ? 'rgba(255,255,255,0.4)' : (voice ? '#d2dae3' : 'var(--border)');
  return (
    <div
      className="msg-audio-wave"
      style={voice ? undefined : { height: 24 }}
      onClick={(e) => {
        e.stopPropagation();
        const r = e.currentTarget.getBoundingClientRect();
        seekAudio(id, (e.clientX - r.left) / r.width);
      }}
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={'msg-audio-wave-bar' + (i < played ? ' on' : '')}
          style={{ height: WAVE_H[i % WAVE_H.length] + 'px', background: i < played ? cPlayed : cRest }}
        />
      ))}
    </div>
  );
}

function AudioPlayer({ a, mine }) {
  const st = useAudio(a.id);
  const voice = !!(a.name && a.name.startsWith('voice_'));
  const playing = st && st.state === 'play';
  const pct = st && st.dur ? (st.t / st.dur) * 100 : 0;

  const label = st && st.dur
    ? fmtDuration(Math.round(st.t)) + ' / ' + fmtDuration(Math.round(st.dur))
    : (a.duration ? fmtDuration(a.duration) : '0:00');

  let name = voice ? 'Голосовое сообщение' : (a.name ? a.name.replace(/\.[^.]+$/, '') : '');
  if (name.length > 30) name = name.slice(0, 28) + '...';

  const btn = (ring) => (
    <button className="msg-audio-btn" onClick={(e) => { e.stopPropagation(); toggleAudio(a.id); }}>
      {ring && <span className="msg-audio-ring" style={{ '--pct': (pct / 100).toFixed(3) + 'turn' }} />}
      <span className="msg-audio-icon">
        {!st ? <PlayIco /> : st.state === 'load' ? <LoadIco /> : playing ? <PauseIco /> : <PlayIco />}
      </span>
    </button>
  );

  /* Голосовое: прогресс живёт на кольце вокруг кнопки, волна остаётся ровной
     и работает только как полоса перемотки. */
  if (voice) {
    return (
      <div className={'msg-audio-player msg-voice' + (playing ? ' playing' : '')}>
        {btn(true)}
        <Wave id={a.id} count={36} pct={pct} mine={mine} voice />
        <span className="msg-audio-time">{label}</span>
      </div>
    );
  }

  /* Файл с музыкой — карточка трека: обложка, название, формат с
     длительностью и тонкая дорожка. Волна тут врала бы: содержимое трека
     мы не знаем, а рисовать одинаковую гребёнку у всех — обман. */
  const ext = (a.name || '').split('.').pop().toUpperCase().slice(0, 4);
  return (
    <div className={'msg-audio-player msg-track' + (playing ? ' playing' : '')}>
      <div className="msg-track-cover">
        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M20 4.5v10.2a3.1 3.1 0 1 1-1.7-2.76V7.2l-7.6 1.5v8.3a3.1 3.1 0 1 1-1.7-2.76V6.3z" />
        </svg>
      </div>
      <div className="msg-audio-info">
        <div className="msg-audio-name-row">
          <span className="msg-audio-name">{name}</span>
          <span className="msg-audio-time">{label}</span>
        </div>
        <div className="msg-track-meta">{ext}{a.size ? ' · ' + fmtSize(a.size) : ''}</div>
        <div
          className="msg-track-line"
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

export default function Attachments({ items, mine, onOpenMedia }) {
  if (!items || !items.length) return null;
  const audios = items.filter((a) => a.type === 'audio');
  const files = items.filter((a) => a.type === 'file');
  /* Порядок пачки — как отправили: раньше картинки шли перед видео, и клип
     из середины альбома уезжал в конец, а с ним и место в просмотрщике. */
  const media = items.filter((a) => a.type === 'image' || a.type === 'video');
  /* Показываем не больше четырёх плиток: остальное уходит под счётчик, иначе
     пачка из двадцати фото растягивает ленту на несколько экранов. */
  const SHOWN = 6;
  const shown = media.slice(0, SHOWN);
  const rest = media.length - shown.length;
  const rows = media.length ? layoutMedia(shown) : [];
  let idx = -1;

  return (
    <>
      {media.length > 0 && (
        <div className="msg-att-grid" style={{ width: MEDIA_W }}>
          {rows.map((cells, ri) => (
            <div className="msg-att-row" key={ri}>
              {cells.map(({ item: a, w, h }) => {
                idx += 1;
                const k = idx;
                return (
                  <div
                    className={'msg-att-thumb' + (a.type === 'video' ? ' msg-att-video' : '')}
                    key={a.id}
                    style={{ width: w, height: h }}
                    onClick={() => onOpenMedia(media, k)}
                  >
                    <img src={a._localUrl || attUrl(a.id, '/thumb')} loading="lazy" alt="" />
                    {a.type === 'video' && (
                      <div className="msg-video-overlay">
                        <div className="msg-video-play">
                          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.2v13.6L19 12z" /></svg>
                        </div>
                        {a.duration ? <span className="msg-video-dur">{fmtDuration(a.duration)}</span> : null}
                      </div>
                    )}
                    {rest > 0 && k === shown.length - 1 && <div className="msg-att-more">+{rest}</div>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {audios.map((a) => <AudioPlayer key={a.id} a={a} mine={mine} />)}

      {files.map((a) => (
        <a
          className="msg-att-file"
          key={a.id}
          href={attUrl(a.id)}
          download={a.name}
          onClick={(e) => e.stopPropagation()}
        >
          <span className="msg-att-file-icon">{(a.name || '').split('.').pop().toUpperCase().slice(0, 4)}</span>
          <div className="msg-att-file-info">
            <div className="msg-att-file-name">{a.name}</div>
            <div className="msg-att-file-size">{fmtSize(a.size)}</div>
          </div>
        </a>
      ))}
    </>
  );
}
