/* Сетка эмодзи под полем ввода.

   Разметка была одинаковой в обоих чатах — отличались только приставки
   классов. А вот сами наборы у «Сообщений» и «Каналов» разные, и это не
   расхождение, а подбор: в рабочем канале нужны 📌 и ⏰, в переписке —
   😘 и 🥰. Поэтому список приходит снаружи. */
export default function EmojiPicker({ emojis, cls, itemCls, onPick, innerRef }) {
  return (
    <div className={cls} style={{ display: 'grid' }} ref={innerRef}>
      {emojis.map((e) => (
        <div className={itemCls} key={e} onClick={() => onPick(e)}>{e}</div>
      ))}
    </div>
  );
}
