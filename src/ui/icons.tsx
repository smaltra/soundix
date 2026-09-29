// Inline SVG line icons for the app.
import type { ReactNode } from 'react'

const LINE = {
  play: <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" stroke="none" />,
  star: (
    <path
      d="M12 3.2l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 17l-5.4 2.9 1.1-6.1-4.5-4.2 6.1-.8z"
      fill="currentColor"
      stroke="none"
    />
  ),
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6.5 6.5l11 11m0-11l-11 11" />,
  link: (
    <path d="M10 13.5a4 4 0 0 0 5.7.3l3-3a4 4 0 0 0-5.7-5.6l-1.3 1.3m2.3 4a4 4 0 0 0-5.7-.3l-3 3a4 4 0 0 0 5.7 5.6l1.3-1.3" />
  ),
  upload: (
    <path d="M12 15V4m-4.5 4.5L12 4l4.5 4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
  ),
  download: (
    <path d="M12 4v11m-4.5-4.5L12 15l4.5-4.5M5 14v4.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V14" />
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.8v.2" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  more: <path d="M5.5 12h.01M12 12h.01M18.5 12h.01" strokeWidth={3.2} />,
  volume: (
    <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11" />
  ),
  keyboard: (
    <>
      <rect x="3" y="6.5" width="18" height="11" rx="2" />
      <path d="M7 10.5h.01M10.3 10.5h.01M13.7 10.5h.01M17 10.5h.01M8 14h8" />
    </>
  ),
  none: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <path d="M6.8 17.2L17.2 6.8" />
    </>
  ),
  pencil: (
    <path d="M4.5 19.5l1-4.2L15.8 5a1.8 1.8 0 0 1 2.6 0l.6.6a1.8 1.8 0 0 1 0 2.6L8.7 18.5zM13.5 7.3l3.2 3.2" />
  ),
  refresh: <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />,
  code: <path d="M8.5 7.5L4 12l4.5 4.5m7-9L20 12l-4.5 4.5" />,
  music: (
    <>
      <path d="M9 17.5V6l10-2v11.5" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  layers: <path d="M12 4l8.5 4.5L12 13 3.5 8.5zm-8.5 8L12 16.5l8.5-4.5m-17 3.5L12 20l8.5-4.5" />,
  sparkle: (
    <path d="M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8-1.8 5.2-1.8-5.2-5.2-1.8 5.2-1.8zM19 16l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  ),
  trash: (
    <path d="M4.5 7h15M10 11v5.5m4-5.5v5.5M6.5 7l.9 12.1a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9L17.5 7M9.5 7V4.5h5V7" />
  ),
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof LINE

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {LINE[name]}
    </svg>
  )
}
