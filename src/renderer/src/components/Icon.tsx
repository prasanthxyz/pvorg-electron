/* Inline icons on a 24 px grid, 1.75 px strokes, drawn for pvorg (no icon dependency). */

const paths: Record<string, React.ReactNode> = {
  viewer: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M10 9.2v5.6l4.8-2.8z" fill="currentColor" stroke="none" />
    </>
  ),
  filters: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 9h9M9.25 12h5.5M11 15h2" />
    </>
  ),
  library: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  galleryMapping: (
    <>
      <rect x="3" y="7" width="14" height="13" rx="2" />
      <path d="M7 4h11a2 2 0 0 1 2 2v10" />
      <path d="m5.5 17 3.5-4 2.5 3 1.5-1.5 2.5 2.5" />
      <circle cx="12.5" cy="10.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  tagMapping: (
    <>
      <path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.2 7.2a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.2-7.2a1 1 0 0 1-.3-.7z" />
      <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" />
    </>
  ),
  thumbsDown: (
    <path d="M17 4h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H17M17 4H8.6a2 2 0 0 0-2 1.6l-1.5 7A2 2 0 0 0 7.1 15H11l-.9 4a1.6 1.6 0 0 0 3 1l3.9-6V4z" />
  ),
  thumbsDownFill: (
    <path
      d="M17 4h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H17M17 4H8.6a2 2 0 0 0-2 1.6l-1.5 7A2 2 0 0 0 7.1 15H11l-.9 4a1.6 1.6 0 0 0 3 1l3.9-6V4z"
      fill="currentColor"
    />
  ),
  contactSheet: (
    <>
      <rect x="3.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="15.5" y="3.5" width="5" height="5" rx="1" />
      <rect x="3.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="15.5" y="9.5" width="5" height="5" rx="1" />
      <rect x="3.5" y="15.5" width="5" height="5" rx="1" />
      <rect x="9.5" y="15.5" width="5" height="5" rx="1" />
      <rect x="15.5" y="15.5" width="5" height="5" rx="1" />
    </>
  ),
  play: (
    <path
      d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z"
      fill="currentColor"
    />
  ),
  pause: (
    <>
      <rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
      <rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none" />
    </>
  ),
  back10: (
    <>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 3.5v3.7h3.7" />
      <text
        x="12"
        y="15.4"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </>
  ),
  forward10: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 3.5v3.7h-3.7" />
      <text
        x="12"
        y="15.4"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </>
  ),
  chevronLeft: <path d="m14.5 6-6 6 6 6" />,
  chevronRight: <path d="m9.5 6 6 6-6 6" />,
  chevronDown: <path d="m6 9.5 6 6 6-6" />,
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none" />
      <path d="m8 12.3 2.7 2.7L16.2 9.4" stroke="var(--check-mark, #fff)" strokeWidth="2.2" />
    </>
  ),
  circle: <circle cx="12" cy="12" r="8.5" />,
  check: <path d="m5.5 12.5 4.2 4.2L18.5 7.8" strokeWidth="2.4" />,
  x: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" strokeWidth="2.4" />,
  minus: <path d="M6.5 12h11" strokeWidth="2.4" />,
  xCircle: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m9.2 9.2 5.6 5.6M14.8 9.2l-5.6 5.6" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.7" />
      <path d="M6.3 6.5 7.2 19a1.5 1.5 0 0 0 1.5 1.4h6.6a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  more: (
    <>
      <circle cx="6" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="18" cy="12" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.5 3.5v3.7h-3.7" />
    </>
  ),
  undo: (
    <>
      <path d="M9 7.5 4.5 12 9 16.5" />
      <path d="M4.5 12h10a5 5 0 0 1 0 10H12" />
    </>
  ),
  warning: (
    <>
      <path d="M10.3 4.3 2.9 17.5a2 2 0 0 0 1.7 3h14.8a2 2 0 0 0 1.7-3L13.7 4.3a2 2 0 0 0-3.4 0z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  close: <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  photo: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m3.5 17 5-5 4 4 2.5-2.5 5.5 5" />
    </>
  ),
  photos: (
    <>
      <rect x="3" y="7" width="14" height="13" rx="2" />
      <path d="M7 4h11a2 2 0 0 1 2 2v10" />
    </>
  ),
  film: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
    </>
  ),
  expand: <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5l-6 6M4.5 19.5l6-6" />,
  external: (
    <>
      <path d="M14 4.5h5.5V10M19.5 4.5 11 13" />
      <path d="M17.5 14v4a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  copy: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
      <path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
    </>
  ),
  clapper: (
    <>
      <rect x="3.5" y="9" width="17" height="11" rx="2" />
      <path d="m3.8 9 15.4-4.2-.9-3.2" transform="translate(0 1)" />
      <path d="m8 5.5 2.5 3.3M13 4.2l2.5 3.3" />
    </>
  ),
  cleanup: (
    <>
      <path d="M14 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5z" />
      <path d="M14 3.5v5h5M9.5 13.5l5 5M14.5 13.5l-5 5" />
    </>
  ),
  folder: (
    <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2.5h7a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  ),
  volume: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" />
      <path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
    </>
  ),
  volumeMute: (
    <>
      <path d="M4.5 9.5h3l4.5-4v13l-4.5-4h-3a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1z" />
      <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
    </>
  ),
  fullScreen: <path d="M4.5 9V4.5H9M15 4.5h4.5V9M19.5 15v4.5H15M9 19.5H4.5V15" />,
  exitFullScreen: <path d="M9 4.5V9H4.5M19.5 9H15V4.5M15 19.5V15h4.5M4.5 15H9v4.5" />,
  plus: <path d="M12 5v14M5 12h14" />,
  sort: <path d="M7 4.5v15M3.8 16.3 7 19.5l3.2-3.2M17 19.5v-15M13.8 7.7 17 4.5l3.2 3.2" />,
  import: (
    <>
      <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10" />
      <path d="M4.5 15.5v2a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-2" />
    </>
  ),
  regenerate: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <path d="M20 15.5a3.5 3.5 0 1 0-1 3" />
      <path d="M20.5 13v2.7h-2.7" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  sidebarLeft: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M9.5 4.5v15M5.75 8.5h1.25M5.75 11h1.25" />
    </>
  ),
  sidebarRight: (
    <>
      <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
      <path d="M15 4.5v15" />
    </>
  )
}

export type IconName = keyof typeof paths

interface IconProps {
  name: IconName
  size?: number
  className?: string
  label?: string
}

export function Icon({ name, size = 18, className, label }: IconProps) {
  return (
    <svg
      className={className ? `icon ${className}` : 'icon'}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
      focusable="false"
    >
      {paths[name]}
    </svg>
  )
}
