import type { SVGProps } from 'react';

export type IconName =
  | 'arrow-left'
  | 'check'
  | 'chevron-right'
  | 'download'
  | 'file'
  | 'grid'
  | 'mail'
  | 'microphone'
  | 'plus'
  | 'prices'
  | 'search'
  | 'settings'
  | 'share'
  | 'warning';

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number };

export default function Icon({ name, size = 24, ...props }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  };

  if (name === 'microphone') {
    return (
      <svg {...common}>
        <rect x="9" y="2" width="6" height="11" rx="3" fill="currentColor" stroke="none" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3.5" />
      </svg>
    );
  }

  const paths: Record<Exclude<IconName, 'microphone'>, React.ReactNode> = {
    'arrow-left': <path d="m14 5-7 7 7 7" />,
    check: <path d="m4 12.5 5 5L20 6.5" />,
    'chevron-right': <path d="m9 5 7 7-7 7" />,
    download: <><path d="M12 3.5v11m0 0-4.5-4.5M12 14.5l4.5-4.5" /><path d="M4 17.5v2A1.5 1.5 0 0 0 5.5 21h13a1.5 1.5 0 0 0 1.5-1.5v-2" /></>,
    file: <><path d="M6 3h8l4 4v14H6V3Z" /><path d="M14 3v5h4" /></>,
    grid: <><rect x="4" y="3" width="16" height="18" rx="3" /><path d="M8 9h8M8 13h8M8 17h4" /></>,
    mail: <><path d="M3 5.5h18v13H3v-13Z" /><path d="m3.5 6.5 8.5 6.5 8.5-6.5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    prices: <><path d="M4 7h16M4 12h16M4 17h9" /><circle cx="18.5" cy="17" r="2.5" /></>,
    search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
    settings: <><circle cx="12" cy="12" r="3.2" /><path d="M12 3.5v2.6M12 17.9v2.6M4.5 12h2.6M16.9 12h2.6M6.7 6.7l1.9 1.9M15.4 15.4l1.9 1.9M17.3 6.7l-1.9 1.9M8.6 15.4l-1.9 1.9" /></>,
    share: <><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5" /></>,
    warning: <><circle cx="12" cy="12" r="9.5" /><path d="M12 7.5V13" /><circle cx="12" cy="16.7" r="1" fill="currentColor" stroke="none" /></>,
  };

  return <svg {...common}>{paths[name]}</svg>;
}
