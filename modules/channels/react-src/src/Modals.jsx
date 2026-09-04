import { useCallback, useEffect, useRef, useState } from 'react';
import SearchField from '../../../../core/react-src/src/shared/SearchField.jsx';
import { CHANNEL_ICONS, api, compressImage, displayName } from './lib.js';
import * as voice from './voice.js';
import Avatar from '../../../../core/react-src/src/shared/Avatar.jsx';
import Modal from '../../../../core/react-src/src/shared/Modal.jsx';
import ConfirmShared from '../../../../core/react-src/src/shared/ConfirmModal.jsx';

/* Окна модуля: группа, канал, подтверждение удаления, добавление участников,
   настройки голоса и два предупреждения перед включением камеры и экрана. */

export function SpaceModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');
  const [photo, setPhoto] = useState('');
  const fileRef = useRef(null);
  const editing = open && open.space;

  useEffect(() => {
    if (!open) return;
    setName(editing ? editing.name : '');
    setType(editing ? (editing.type || 'text') : 'text');
    setPhoto(editing ? (editing.photo || '') : '');
  }, [open]);

  if (!open) return null;

  const pick = () => {
    const input = fileRef.current;
    input.onchange = () => {
      const f = input.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async (e) => setPhoto(await compressImage(e.target.result));
      r.readAsDataURL(f);
    };
    input.click();
  };

  return (
    <Modal title={editing ? 'Изменить группу' : 'Создать группу'} onClose={onClose}>
      <div className="form-group">
        <label className="form-label">Название</label>
        <input className="form-input" placeholder="Моя группа" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {!editing && (
        <div className="form-group">
          <label className="form-label">Тип группы</label>
          <div className="ch-type-picker">
            <label className="ch-type-opt">
              <input type="radio" name="chSpaceType" value="text" checked={type === 'text'} onChange={() => setType('text')} />
              <div className="ch-type-opt-body">
                <span className="ch-type-opt-title">💬 Текстовая</span>
                <small className="ch-type-opt-desc">Каналы с сообщениями</small>
              </div>
            </label>
            <label className="ch-type-opt">
              <input type="radio" name="chSpaceType" value="voice_group" checked={type === 'voice_group'} onChange={() => setType('voice_group')} />
              <div className="ch-type-opt-body">
                <span className="ch-type-opt-title">🔊 Голосовая</span>
                <small className="ch-type-opt-desc">Только голосовые комнаты</small>
              </div>
            </label>
          </div>
        </div>
      )}
      <div className="form-group">
        <label className="form-label">Фото (необязательно)</label>
        <div className="ch-photo-row">
          <div className="ch-space-photo-pick" onClick={pick}>
            {photo
              ? <img src={'data:image/jpeg;base64,' + photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }} />
              : <span className="ico ico-18 ico-attach" style={{ opacity: 0.4 }} />}
          </div>
          <button className="btn btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setPhoto('')}>Удалить</button>
        </div>
        <input type="file" accept="image/*" style={{ display: 'none' }} ref={fileRef} />
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button
          className="btn btn-primary"
          onClick={() => { const v = name.trim(); if (v) onSave({ id: editing ? editing.id : null, name: v, type, photo }); }}
        >
          {editing ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </Modal>
  );
}

export function ChannelModal({ open, onClose, onSave }) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('channels');
  const editing = open && open.channel;

  useEffect(() => {
    if (!open) return;
    setName(editing ? editing.name : '');
    setIcon(editing ? (editing.icon || 'channels') : 'channels');
  }, [open]);

  if (!open) return null;
  return (
    <Modal title={editing ? 'Изменить канал' : 'Создать канал'} onClose={onClose}>
      <div className="form-group">
        <label className="form-label">Название</label>
        <input className="form-input" placeholder="общий" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="form-group">
        <label className="form-label">Иконка</label>
        <div className="ch-icon-picker">
          {CHANNEL_ICONS.map((ic) => (
            <div
              className={'ch-icon-opt' + (icon === ic ? ' selected' : '')}
              key={ic} onClick={() => setIcon(ic)}
            >
              <span className={'ico ico-16 ico-' + ic} />
            </div>
          ))}
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button
          className="btn btn-primary"
          onClick={() => { const v = name.trim(); if (v) onSave({ id: editing ? editing.id : null, name: v, icon }); }}
        >
          {editing ? 'Сохранить' : 'Создать'}
        </button>
      </div>
    </Modal>
  );
}

export function ConfirmModal({ open, onClose, onConfirm }) {
  if (!open) return null;
  return (
    <ConfirmShared
      title={open.title} text={open.text} okLabel={open.okLabel}
      onClose={onClose} onConfirm={onConfirm}
    />
  );
}

export function AddMembersModal({ open, members, onClose, onAdd }) {
  const [users, setUsers] = useState(null);
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setQ('');
    api('/api/mod/channels/users').then((d) => setUsers(Array.isArray(d) ? d : []));
  }, [open]);

  if (!open) return null;
  const existing = members.map((m) => m.user_id);
  const available = (users || []).filter((u) => existing.indexOf(u.id) === -1);
  const s = q.trim().toLowerCase();
  const list = available.filter((u) => !s || displayName(u).toLowerCase().includes(s) || (u.username || '').toLowerCase().includes(s));

  return (
    <Modal title="Добавить участников" onClose={onClose}>
      <div style={{ marginBottom: 10 }}>
        <SearchField className="ch-member-search" placeholder="Поиск" value={q} onChange={setQ} clearable />
      </div>
      <div className="ch-member-picker">
        {users === null && <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>Загрузка…</div>}
        {users !== null && !list.length && (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)', fontSize: 12 }}>
            {available.length ? 'Никого не нашли' : 'Все уже добавлены'}
          </div>
        )}
        {list.map((u) => (
          <div
            className={'ch-member-pick' + (picked.includes(u.id) ? ' selected' : '')}
            key={u.id}
            onClick={() => setPicked((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : p.concat(u.id)))}
          >
            <Avatar cls="ch-member-pick-ava" src={u.avatar} name={displayName(u)} />
            <span className="ch-member-name">{displayName(u)}</span>
            <span className={'role-badge ' + u.role} style={{ fontSize: 8, padding: '1px 4px' }}>{(u.role || '').toUpperCase()}</span>
          </div>
        ))}
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={() => picked.length && onAdd(picked)}>Добавить</button>
      </div>
    </Modal>
  );
}

/** Настройки голоса: выбор устройств и проверка микрофона. */
export function VoiceSettingsModal({ open, onClose }) {
  const [devices, setDevices] = useState({ mics: [], cams: [], spks: [] });
  const [picked, setPicked] = useState(voice.getDevices());
  const [level, setLevel] = useState(0);
  const test = useRef(null);

  const load = useCallback(() => navigator.mediaDevices.enumerateDevices().then((all) => {
    setDevices({
      mics: all.filter((d) => d.kind === 'audioinput'),
      cams: all.filter((d) => d.kind === 'videoinput'),
      spks: all.filter((d) => d.kind === 'audiooutput'),
    });
  }).catch(() => {}), []);

  useEffect(() => {
    if (!open) return undefined;
    setPicked(voice.getDevices());
    load();
    // Список меняется на ходу: воткнули гарнитуру — она должна появиться
    const md = navigator.mediaDevices;
    if (md && md.addEventListener) md.addEventListener('devicechange', load);
    return () => {
      if (md && md.removeEventListener) md.removeEventListener('devicechange', load);
      stopTest();
    };
  }, [open, load]);

  /* Выбор применяем сразу и запоминаем: раньше select висел сам по себе —
     ни живая дорожка не менялась, ни выбор не переживал закрытие окна. */
  const choose = (kind, id) => {
    setPicked((v) => ({ ...v, [kind]: id }));
    voice.setDevice(kind, id);
    if (kind === 'mic' && test.current) { stopTest(); setTimeout(startTest, 60); }
  };

  const stopTest = () => {
    if (!test.current) return;
    const { stream, ctx } = test.current;
    stream.getTracks().forEach((t) => t.stop());
    try { ctx.close(); } catch (e) { /* уже закрыт */ }
    test.current = null;
    setLevel(0);
  };

  const startTest = async () => {
    if (test.current) { stopTest(); return; }
    try {
      const chosen = voice.getDevices().mic;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: chosen ? { deviceId: { exact: chosen } } : true,
      });
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(an);
      const data = new Uint8Array(an.frequencyBinCount);
      test.current = { stream, ctx };
      const tick = () => {
        if (!test.current) return;
        an.getByteFrequencyData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i];
        setLevel(Math.min(100, Math.round((sum / data.length) * 2.5)));
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) { /* без разрешения проверять нечего */ }
  };

  if (!open) return null;
  const opts = (list, prefix) => list.map((d, i) => <option value={d.deviceId} key={d.deviceId || i}>{d.label || prefix + ' ' + (i + 1)}</option>);
  const sinkOk = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  return (
    <Modal title="⚙️ Настройки голоса" onClose={() => { stopTest(); onClose(); }} boxCls="ch-vs-modal">
      <div className="form-group">
        <label className="form-label">Микрофон</label>
        <select className="form-input" data-kind="mic" value={picked.mic} onChange={(e) => choose('mic', e.target.value)}>
          <option value="">Системный по умолчанию</option>
          {opts(devices.mics, 'Микрофон')}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Камера</label>
        <select className="form-input" data-kind="cam" value={picked.cam} onChange={(e) => choose('cam', e.target.value)}>
          <option value="">Системная по умолчанию</option>
          {opts(devices.cams, 'Камера')}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Динамик</label>
        <select
          className="form-input" data-kind="spk" value={picked.spk}
          disabled={!sinkOk} onChange={(e) => choose('spk', e.target.value)}
        >
          <option value="">Системный динамик</option>
          {sinkOk ? opts(devices.spks, 'Динамик') : null}
        </select>
        {!sinkOk && <div className="form-hint">Браузер не умеет выбирать динамик — звук идёт в системный</div>}
      </div>
      <div className="form-group">
        <label className="form-label">Тест микрофона</label>
        <div className="ch-vs-test-wrap">
          <button className="btn btn-secondary ch-vs-test-btn" onClick={startTest}>{test.current ? '■ Остановить' : '▶ Начать тест'}</button>
          <div className="ch-vs-meter"><div className="ch-vs-meter-fill" style={{ width: level + '%' }} /></div>
        </div>
      </div>
      <div className="form-group">
        <button
          className="btn btn-secondary" style={{ width: '100%' }}
          onClick={() => navigator.mediaDevices.getUserMedia({ audio: true, video: true })
            // Названия устройств браузер отдаёт только после разрешения — перечитываем
            .then((s) => { s.getTracks().forEach((t) => t.stop()); load(); }).catch(() => {})}
        >
          🔐 Запросить разрешения на микрофон и камеру
        </button>
      </div>
      <div className="modal-actions">
        <button className="btn btn-primary" onClick={() => { stopTest(); onClose(); }}>Готово</button>
      </div>
    </Modal>
  );
}

/** Предупреждение перед включением камеры или показом экрана. */
export function MediaConfirmModal({ open, onClose, onConfirm }) {
  if (!open) return null;
  const screen = open === 'screen';
  return (
    <Modal title={screen ? 'Показать экран?' : 'Включить камеру?'} onClose={onClose}>
      <div style={{ color: 'var(--text-dim)', fontSize: 13, marginBottom: 16 }}>
        {screen
          ? 'Содержимое вашего экрана будет видно всем участникам комнаты.'
          : 'Ваше изображение станет видно всем участникам комнаты.'}
      </div>
      <div className="modal-actions">
        <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
        <button className="btn btn-primary" onClick={onConfirm}>{screen ? 'Показать' : 'Включить'}</button>
      </div>
    </Modal>
  );
}
