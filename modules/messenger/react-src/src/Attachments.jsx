import { seekAudio, toggleAudio, useAudio } from './audio.js';
import { WAVE_H, attUrl, fmtDuration, fmtSize } from './lib.js';

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
          className="msg-audio-wave-bar"
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

  const btn = (
    <button className="msg-audio-btn" onClick={(e) => { e.stopPropagation(); toggleAudio(a.id); }}>
      <span className="msg-audio-icon">
        {!st ? <PlayIco /> : st.state === 'load' ? <LoadIco /> : playing ? <PauseIco /> : <PlayIco />}
      </span>
    </button>
  );

  if (voice) {
    return (
      <div className={'msg-audio-player msg-voice' + (playing ? ' playing' : '')}>
        {btn}
        <Wave id={a.id} count={36} pct={pct} mine={mine} voice />
        <span className="msg-audio-time">{label}</span>
      </div>
    );
  }
  return (
    <div className={'msg-audio-player' + (playing ? ' playing' : '')}>
      {btn}
      <div className="msg-audio-info">
        <div className="msg-audio-name-row">
          <span className="msg-audio-name">{name}</span>
          <span className="msg-audio-time">{label}</span>
        </div>
        <Wave id={a.id} count={44} pct={pct} mine={mine} />
      </div>
    </div>
  );
}

export default function Attachments({ items, mine, onOpenMedia }) {
  if (!items || !items.length) return null;
  const images = items.filter((a) => a.type === 'image');
  const videos = items.filter((a) => a.type === 'video');
  const audios = items.filter((a) => a.type === 'audio');
  const files = items.filter((a) => a.type === 'file');
  /* Просмотрщик листает всю пачку сообщения в том же порядке, что и сетка */
  const media = images.concat(videos);

  return (
    <>
      {media.length > 0 && (
        <div className="msg-att-grid">
          {images.map((a, k) => (
            <div className="msg-att-thumb" key={a.id} onClick={() => onOpenMedia(media, k)}>
              <img src={a._localUrl || attUrl(a.id, '/thumb')} loading="lazy" alt="" />
            </div>
          ))}
          {videos.map((a, k) => (
            <div className="msg-att-thumb msg-att-video" key={a.id} onClick={() => onOpenMedia(media, images.length + k)}>
              <img src={attUrl(a.id, '/thumb')} loading="lazy" alt="" />
              <div className="msg-video-overlay">
                <div className="msg-video-play">▶</div>
                {a.duration ? <span className="msg-video-dur">{fmtDuration(a.duration)}</span> : null}
              </div>
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
          <span className="msg-att-file-icon"><span className="ico ico-18 ico-file" /></span>
          <div className="msg-att-file-info">
            <div className="msg-att-file-name">{a.name}</div>
            <div className="msg-att-file-size">{fmtSize(a.size)}</div>
          </div>
        </a>
      ))}
    </>
  );
}
