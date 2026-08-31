const PATHS = {
  search: <><path d="M14.5 14.5 11 11" /><circle cx="7" cy="7" r="4.5" /></>,
  plus: <path d="M8 2.5v11M2.5 8h11" />,
  pencil: <path d="M11.3 2.3a1.6 1.6 0 0 1 2.4 2.4L5 13.4l-3 .8.8-3 8.5-8.9Z" />,
  trash: <path d="M3 4.5h10M6.3 4.5V3a1 1 0 0 1 1-1h1.4a1 1 0 0 1 1 1v1.5M4.3 4.5l.6 8.2a1 1 0 0 0 1 .9h4.2a1 1 0 0 0 1-.9l.6-8.2" />,
  chevron: <path d="M4 6l4 4 4-4" />,
  gear: <><circle cx="8" cy="8" r="2.3" /><path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.4 3.6l-1.1 1.1M4.7 11.3l-1.1 1.1M12.4 12.4l-1.1-1.1M4.7 4.7 3.6 3.6" /></>,
  x: <path d="M4 4l8 8M12 4l-8 8" />,
  shield: <path d="M8 1.8 13 3.6v4c0 3.1-2 5.5-5 6.6-3-1.1-5-3.5-5-6.6v-4L8 1.8Z" />,
  question: <><circle cx="8" cy="8" r="6.2" /><path d="M6.3 6.2a1.75 1.75 0 1 1 2.4 1.6c-.5.2-.7.6-.7 1.1v.4" /><path d="M8 11.6h.01" /></>,
};

export default function Icon({ name, className }) {
  return (
    <svg className={'adm-ic' + (className ? ' ' + className : '')} viewBox="0 0 16 16">
      {PATHS[name]}
    </svg>
  );
}
