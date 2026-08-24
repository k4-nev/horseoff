const TIERS = ['common', 'uncommon', 'rare', 'mythical', 'legendary', 'immortal'];

export default function TierChips({ value, onChange }) {
  return (
    <div className="adm-tier-strip">
      {TIERS.map((t) => (
        <button
          key={t}
          type="button"
          className={'adm-tier-chip' + (t === value ? ' on' : '')}
          onClick={() => onChange(t)}
        >
          <span className={'role-badge ' + t}>{t.toUpperCase()}</span>
        </button>
      ))}
    </div>
  );
}
