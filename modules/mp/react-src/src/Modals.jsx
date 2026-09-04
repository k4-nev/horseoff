import { useEffect, useState } from 'react';
import { PLATFORMS } from './mock.js';
import { Dropdown, fmtCode, qrDataUri, stub } from './atoms.jsx';
import Shared from '../../../../core/react-src/src/shared/Modal.jsx';

/* Оболочка модалки: одна на все виды, Escape и клик по фону закрывают. */
/* Оформление у модуля своё, поведение — общее (см. shared/Modal.jsx). */
const MP_MODAL = {
  ov: 'mp-modal-ov open', box: 'mp-modal', head: 'mp-modal-h', title: '', close: 'mp-modal-close',
};

export function Modal({ open, width, title, children, onClose }) {
  return (
    <Shared
      open={open} title={title} onClose={onClose}
      classes={MP_MODAL} titleTag="h3" closeIcon="×"
      boxStyle={{ width: width || 560 }}
    >
      {children}
    </Shared>
  );
}

export function NewServerForm({ onCreate, onClose }) {
  const [name, setName] = useState('');
  const [platform, setPlatform] = useState(PLATFORMS[0]);
  return (
    <>
      <div className="mp-field">
        <label>Платформа</label>
        <Dropdown value={platform} options={PLATFORMS} onPick={setPlatform} width="full" />
      </div>
      <div className="mp-field">
        <label>Название сервера</label>
        <input
          className="mp-input" placeholder="Server-RU-02" autoFocus
          value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onCreate(name.trim(), platform); }}
        />
      </div>
      <p style={{ color: 'var(--text-dim)', fontSize: 12, marginBottom: 14 }}>
        Пока сервер создаётся локально (без бэкенда) — для дебага интерфейса.
        Сервер попадёт в группу выбранной платформы.
      </p>
      <button className="btn btn-primary wide" onClick={() => onCreate(name.trim(), platform)}>Создать сервер</button>
    </>
  );
}

export const QrBody = ({ code }) => (
  <div style={{ textAlign: 'center', padding: 6 }}>
    <img src={qrDataUri(code)} alt="" style={{ width: 180, height: 180, margin: '0 auto 14px', borderRadius: 12, border: '1px solid var(--border)' }} />
    <div className="mp-mono" style={{ fontSize: 30, fontWeight: 800, letterSpacing: 5, color: 'var(--text)' }}>{fmtCode(code)}</div>
    <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 6 }}>Назовите код или покажите QR на ПВЗ</div>
  </div>
);

export function SingleBuyoutForm({ onClose }) {
  const [gender, setGender] = useState('Любой');
  return (
    <>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div className="mp-cap" style={{ flex: 1 }}><span className="mp-ava f sm">Ж</span><span className="mp-cap-lbl">Доступно</span><b>18</b></div>
        <div className="mp-cap" style={{ flex: 1 }}><span className="mp-ava m sm">М</span><span className="mp-cap-lbl">Доступно</span><b>11</b></div>
      </div>
      <div className="mp-field">
        <label>Товары (артикул + ключевое слово)</label>
        <input className="mp-input" placeholder="187264500 · платье летнее" />
        <div style={{ marginTop: 7 }}><button className="btn btn-secondary sm" onClick={stub}>+ Добавить товар</button></div>
      </div>
      <div className="mp-field">
        <label>Пол</label>
        <Dropdown value={gender} options={['Любой', 'Женский', 'Мужской']} onPick={setGender} width="full" />
      </div>
      <div className="mp-field"><label>Адрес ПВЗ</label><input className="mp-input" placeholder="Город, улица…" /></div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="mp-field" style={{ flex: 1 }}><label>Дата</label><input className="mp-input" type="date" /></div>
        <div className="mp-field" style={{ flex: 1 }}><label>С</label><input className="mp-input" type="time" /></div>
        <div className="mp-field" style={{ flex: 1 }}><label>До</label><input className="mp-input" type="time" /></div>
      </div>
      <button className="btn btn-primary wide" onClick={onClose}>Запустить выкуп</button>
    </>
  );
}

export const MassBuyoutForm = () => (
  <>
    <div style={{ border: '2px dashed var(--border)', borderRadius: 12, padding: 32, textAlign: 'center', color: 'var(--text-dim)', marginBottom: 13 }}>
      Перетащи Excel-файл сюда<br /><span style={{ fontSize: 12 }}>или нажми для выбора</span>
    </div>
    <div style={{ display: 'flex', gap: 10 }}>
      <div className="mp-field" style={{ flex: 1 }}><label>Дата</label><input className="mp-input" type="date" /></div>
      <div className="mp-field" style={{ flex: 1 }}><label>С</label><input className="mp-input" type="time" /></div>
      <div className="mp-field" style={{ flex: 1 }}><label>До</label><input className="mp-input" type="time" /></div>
    </div>
    <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
      После загрузки здесь появится таблица разобранных строк с полами, адресами и товарами.
    </p>
  </>
);

export function ComposerForm({ onClose }) {
  const [gender, setGender] = useState('Любой');
  return (
    <>
      <div className="mp-field"><label>Оценка</label><div className="mp-stars" style={{ fontSize: 26 }}>★★★★★</div></div>
      <div className="mp-field">
        <label>Пол аккаунта</label>
        <Dropdown value={gender} options={['Любой', 'Женский', 'Мужской']} onPick={setGender} width="full" />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="mp-field" style={{ flex: 1 }}><label>Дата</label><input className="mp-input" type="date" /></div>
        <div className="mp-field" style={{ flex: 1 }}><label>Время</label><input className="mp-input" type="time" /></div>
      </div>
      <div className="mp-field"><label>Плюсы</label><input className="mp-input" /></div>
      <div className="mp-field"><label>Минусы</label><input className="mp-input" /></div>
      <div className="mp-field"><label>Комментарий</label><textarea className="mp-input" rows="3" /></div>
      <div className="mp-field">
        <label>Фото / видео</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div className="mp-prod-ph" style={{ width: 48, height: 48 }} />
          <button className="btn btn-secondary" style={{ width: 48, height: 48, padding: 0, fontSize: 20 }} onClick={stub}>+</button>
        </div>
      </div>
      <button className="btn btn-primary wide" onClick={onClose}>Сохранить в план</button>
    </>
  );
}

export const ConfirmBody = ({ body, confirm, onOk, onClose }) => (
  <>
    <p style={{ color: '#54545c', fontSize: 14, lineHeight: 1.5, marginBottom: 18 }}>{body}</p>
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
      <button className="mp-wu-neutral" onClick={onClose}>Отмена</button>
      <button className="mp-wu-danger" onClick={() => { onOk(); onClose(); }}>{confirm}</button>
    </div>
  </>
);
