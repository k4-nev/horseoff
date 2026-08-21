import { useEffect, useState } from 'react';
import { initials, avatarSrc, HEART, T } from './icons.jsx';

/* Подтверждение отправки вместо сухой строки «Валентинка отправлена для X»:
   сердце улетает от твоей аватарки к аватарке получателя, обе гаснут, и
   остаётся короткое «Отправлено». Момент отправки признания — единственное
   место в модуле, где уместен свой маленький сюжет. */
export default function SentFlight({ me, to, reduced, onDone }) {
  // fly → сердце в пути, label → аватарки ушли, осталась надпись
  const [stage, setStage] = useState(reduced ? 'label' : 'fly');

  useEffect(() => {
    const timers = [];
    if (!reduced) timers.push(setTimeout(() => setStage('label'), T.xl + 220));
    timers.push(setTimeout(onDone, reduced ? 1500 : T.xl + 1700));
    return () => timers.forEach(clearTimeout);
  }, [reduced, onDone]);

  const face = (person) => {
    const src = avatarSrc(person && person.avatar);
    const name = (person && (person.display_name || person.username)) || '';
    return src ? <img src={src} alt="" /> : initials(name || '?');
  };

  return (
    <div className="vl-sent" role="status" aria-live="polite">
      <div className={'vl-sent-inner' + (stage === 'label' ? ' vl-done' : '')}>
        <div className="vl-sent-row">
          <span className="vl-sent-ava">{face(me)}</span>
          <span className="vl-sent-heart">{HEART}</span>
          <span className="vl-sent-ava vl-sent-to">{face(to)}</span>
        </div>
        <div className="vl-sent-label">
          Отправлено <span className="vl-sent-mark">{HEART}</span>
        </div>
      </div>
    </div>
  );
}
