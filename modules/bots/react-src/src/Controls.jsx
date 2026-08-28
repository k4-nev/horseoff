import { useLayoutEffect, useRef, useState } from 'react';
import Widget from './Widgets.jsx';
import { GAP_PX, ROW_PX, calcSectionHeight, defH, defW, gridCols, groupControls, minH, minW } from './lib.js';

/* Сетка контролов и режим правки раскладки.

   Раскладка хранится на сервере как [{id,w,h,manualH}] и не зависит от того,
   в каком порядке бот прислал контролы: человек расставляет карточки под
   себя, а манифест может меняться. Секции — контейнеры: их высота считается
   по содержимому, пока её не задали руками.

   Перетаскивание намеренно оставлено на pointer-событиях и elementFromPoint:
   HTML5 drag-and-drop не работает на телефоне, а модуль открывают и с него. */

const GRIP = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9" cy="5" r="1.8" /><circle cx="15" cy="5" r="1.8" />
    <circle cx="9" cy="12" r="1.8" /><circle cx="15" cy="12" r="1.8" />
    <circle cx="9" cy="19" r="1.8" /><circle cx="15" cy="19" r="1.8" />
  </svg>
);
const RH_W = <svg width="6" height="14" viewBox="0 0 6 20" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="2" x2="2" y2="18" /><line x1="5" y1="2" x2="5" y2="18" /></svg>;
const RH_H = <svg width="14" height="6" viewBox="0 0 20 6" fill="none" stroke="currentColor" strokeWidth="2"><line x1="2" y1="2" x2="18" y2="2" /><line x1="2" y1="5" x2="18" y2="5" /></svg>;

export default function Controls({
  controls, editMode, locked, send, onReorder, onResize, onTableClear, onTableEdit,
}) {
  const cols = gridCols();
  const gridRef = useRef(null);
  const [preview, setPreview] = useState(null);   // живой размер во время тяги
  const flip = useRef(null);                      // снимок позиций до перестановки

  /* Плавный переезд карточек после перестановки: снимаем позиции до, сверяем
     после и догоняем их переходом. Без этого список прыгает скачком. */
  useLayoutEffect(() => {
    const snap = flip.current;
    if (!snap) return;
    flip.current = null;
    requestAnimationFrame(() => {
      document.querySelectorAll('[data-ctrl-id]').forEach((el) => {
        const old = snap.get(el.dataset.ctrlId);
        if (!old) return;
        const cur = el.getBoundingClientRect();
        const dx = old.left - cur.left;
        const dy = old.top - cur.top;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px,${dy}px)`;
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.32s cubic-bezier(.4,0,.2,1)';
          el.style.transform = '';
          el.addEventListener('transitionend', () => { el.style.transition = ''; el.style.transform = ''; }, { once: true });
        });
      });
    });
  }, [controls]);

  const sized = (ctrl) => {
    const p = preview && preview.id === ctrl.id ? preview : null;
    return {
      w: Math.min((p && p.w) || ctrl._w || defW(ctrl.type), cols),
      h: (p && p.h) || ctrl._h || defH(ctrl.type),
      manualH: p && p.manualH !== undefined ? p.manualH : ctrl._manualH,
    };
  };

  /* ── Перетаскивание ─────────────────────────────────────────────────── */
  const startDrag = (e, ctrl) => {
    if (e.button && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const card = gridRef.current.querySelector(`[data-ctrl-id="${CSS.escape(ctrl.id)}"]`);
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const isSection = ctrl.type === 'section';

    const ghost = card.cloneNode(true);
    ghost.querySelectorAll('.bt-edit-handle,.bt-resize-handle,.bt-edit-size-badge').forEach((h) => h.remove());
    Object.assign(ghost.style, {
      position: 'fixed', left: rect.left + 'px', top: rect.top + 'px',
      width: rect.width + 'px', height: rect.height + 'px',
      pointerEvents: 'none', zIndex: '9999', margin: '0', opacity: '0.88',
      boxShadow: '0 12px 40px rgba(0,0,0,0.3)', transform: 'scale(1.03)', borderStyle: 'solid',
    });
    document.body.appendChild(ghost);
    card.classList.add('bt-drag-source');

    let targetId = null;
    let before = true;
    const clearMarks = () => document.querySelectorAll('[data-ctrl-id]').forEach((c) => c.classList.remove('bt-drop-before', 'bt-drop-after'));

    const onMove = (ev) => {
      ghost.style.transform = `translate(${ev.clientX - e.clientX}px,${ev.clientY - e.clientY}px) scale(1.03)`;
      ghost.style.display = 'none';
      const under = document.elementFromPoint(ev.clientX, ev.clientY);
      ghost.style.display = '';
      const tc = under && under.closest('[data-ctrl-id]');
      let newId = null;
      if (tc && tc.dataset.ctrlId !== ctrl.id) {
        const target = controls.find((c) => c.id === tc.dataset.ctrlId);
        // Секцию можно ставить только между секциями — иначе она уедет внутрь себя
        if (!isSection || (target && target.type === 'section')) newId = tc.dataset.ctrlId;
      }
      if (newId) {
        const el = gridRef.current.querySelector(`[data-ctrl-id="${CSS.escape(newId)}"]`);
        const tr = el.getBoundingClientRect();
        const isBefore = ev.clientY < tr.top + tr.height / 2;
        if (newId !== targetId || isBefore !== before) {
          targetId = newId; before = isBefore;
          clearMarks();
          el.classList.add(isBefore ? 'bt-drop-before' : 'bt-drop-after');
        }
      } else if (targetId) {
        clearMarks();
        targetId = null;
      }
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      ghost.remove();
      card.classList.remove('bt-drag-source');
      clearMarks();
      if (targetId && targetId !== ctrl.id) {
        flip.current = new Map();
        document.querySelectorAll('[data-ctrl-id]').forEach((el) => flip.current.set(el.dataset.ctrlId, el.getBoundingClientRect()));
        onReorder(ctrl.id, targetId, before);
      }
      if (navigator.vibrate) navigator.vibrate(15);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  /* ── Изменение размера ──────────────────────────────────────────────── */
  const startResize = (e, ctrl, dir, boundCols) => {
    e.preventDefault();
    e.stopPropagation();
    const card = gridRef.current.querySelector(`[data-ctrl-id="${CSS.escape(ctrl.id)}"]`);
    if (!card) return;
    const isSection = ctrl.type === 'section';
    const startW = ctrl._w || defW(ctrl.type);
    const startH = ctrl._h || defH(ctrl.type);
    const startPxH = card.clientHeight;
    const startX = e.clientX;
    const startY = e.clientY;
    const cellW = (gridRef.current.clientWidth - GAP_PX * (cols - 1)) / cols;
    let next = { id: ctrl.id, w: startW, h: startH, manualH: ctrl._manualH };

    card.classList.add('bt-resizing');
    document.body.style.cursor = dir === 'w' ? 'ew-resize' : 'ns-resize';

    const onMove = (ev) => {
      if (dir === 'w') {
        const w = Math.max(minW(ctrl.type), Math.min(boundCols, startW + Math.round((ev.clientX - startX) / cellW)));
        next = { ...next, w };
      } else if (isSection) {
        next = { ...next, manualH: Math.max(60, startPxH + (ev.clientY - startY)) };
      } else {
        const h = Math.max(minH(ctrl.type), startH + Math.round((ev.clientY - startY) / (ROW_PX + GAP_PX)));
        next = { ...next, h };
      }
      setPreview(next);
    };

    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      card.classList.remove('bt-resizing');
      document.body.style.cursor = '';
      setPreview(null);
      onResize(ctrl.id, { w: next.w, h: next.h, manualH: next.manualH });
      if (navigator.vibrate) navigator.vibrate(10);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  };

  const handles = (ctrl, w, h, boundCols, sectionMode) => (
    <>
      <div className={'bt-edit-handle' + (sectionMode ? ' bt-sect-handle' : '')} onPointerDown={(e) => startDrag(e, ctrl)}>{GRIP}</div>
      <div className={'bt-edit-size-badge' + (sectionMode ? ' bt-sect-handle' : '')}>{sectionMode ? w + '×' : w + '×' + h}</div>
      <div className={'bt-resize-handle bt-rh-w' + (sectionMode ? ' bt-sect-handle' : '')} onPointerDown={(e) => startResize(e, ctrl, 'w', boundCols)}>{RH_W}</div>
      <div className={'bt-resize-handle bt-rh-h' + (sectionMode ? ' bt-sect-handle' : '')} onPointerDown={(e) => startResize(e, ctrl, 'h', boundCols)}>{RH_H}</div>
    </>
  );

  const card = (ctrl, boundCols, inSection) => {
    const { w, h } = sized(ctrl);
    const style = inSection
      ? { gridColumn: `span ${Math.min(w, boundCols)}`, gridRow: `span ${h}`, position: editMode ? 'relative' : undefined }
      : { gridColumn: `span ${w}`, height: h * ROW_PX + (h - 1) * GAP_PX + 'px', position: editMode ? 'relative' : undefined };
    return (
      <Widget
        key={ctrl.id} ctrl={ctrl} send={send} locked={locked}
        onTableClear={onTableClear} onTableEdit={onTableEdit} style={style}
      >
        {editMode && handles(ctrl, Math.min(w, boundCols), h, boundCols, false)}
      </Widget>
    );
  };

  const groups = groupControls(controls);

  return (
    <div
      className={'bt-controls-grid' + (editMode ? ' bt-edit-mode' : '')}
      id="btControlsGrid"
      ref={gridRef}
      style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
    >
      {groups.map((g, gi) => {
        if (!g.section) {
          return g.children.map((c) => card(c, cols, false));
        }
        const { w: sw, manualH } = sized(g.section);
        const height = manualH !== undefined ? manualH : calcSectionHeight(g.children, sw);
        return (
          <div
            className="bt-section-wrap"
            data-ctrl-id={g.section.id}
            key={g.section.id || gi}
            style={{ gridColumn: `span ${sw}`, height: height + 'px', position: editMode ? 'relative' : undefined }}
          >
            <div className="bt-section-divider">
              <div className="bt-section-divider-line" />
              <span className="bt-section-divider-label">{g.section.label}</span>
              <div className="bt-section-divider-line" />
            </div>
            <div className="bt-section-inner-grid" style={{ gridTemplateColumns: `repeat(${sw}, 1fr)` }}>
              {g.children.map((c) => card(c, sw, true))}
            </div>
            {editMode && handles(g.section, sw, 0, cols, true)}
          </div>
        );
      })}
    </div>
  );
}
