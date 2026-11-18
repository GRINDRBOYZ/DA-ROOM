import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function IconBase({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CopyIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="8" y="8" width="11" height="11" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </IconBase>
);

export const LinkIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M10 13a5 5 0 0 0 7.54.54l2-2a5 5 0 0 0-7.07-7.07l-1.14 1.14" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-2 2a5 5 0 0 0 7.07 7.07l1.13-1.13" />
  </IconBase>
);

export const CheckIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m5 12 4 4L19 6" />
  </IconBase>
);

export const ArrowRightIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </IconBase>
);

export const UploadIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 16V4M7 9l5-5 5 5" />
    <path d="M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3" />
  </IconBase>
);

export const ClipboardIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="5" y="5" width="14" height="16" rx="2" />
    <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
    <path d="M9 11h6M9 15h6" />
  </IconBase>
);

export const ImageIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <circle cx="8.5" cy="9" r="1.5" />
    <path d="m4 17 5-5 4 4 3-3 4 4" />
  </IconBase>
);

export const CrownIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m3 8 4 3 5-7 5 7 4-3-2 11H5L3 8Z" />
    <path d="M5 22h14" />
  </IconBase>
);

export const ClockIcon = (props: IconProps) => (
  <IconBase {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </IconBase>
);

export const UsersIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </IconBase>
);

export const XIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </IconBase>
);

export const ExitIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="M16 17l5-5-5-5M21 12H9" />
  </IconBase>
);

export const SparkIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </IconBase>
);

export const ChevronIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m9 18 6-6-6-6" />
  </IconBase>
);

export const PlusIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 5v14M5 12h14" />
  </IconBase>
);

export const MinusIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M5 12h14" />
  </IconBase>
);

export const TrophyIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M8 3h8v5a4 4 0 0 1-8 0V3Z" />
    <path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4H9z" />
  </IconBase>
);

export const DoorIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M13 4 5 6v14l8 2V4Z" />
    <path d="M13 4h6v18h-6" />
    <circle cx="10" cy="12" r="1" />
  </IconBase>
);

export const BoltIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />
  </IconBase>
);

export const EyeIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </IconBase>
);

export const FilmIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" />
  </IconBase>
);

export const PlayIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m7 4 13 8-13 8V4Z" />
  </IconBase>
);

export const PauseIcon = (props: IconProps) => (
  <IconBase {...props}>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </IconBase>
);

export const DownloadIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M12 3v12M7 10l5 5 5-5" />
    <path d="M5 20h14" />
  </IconBase>
);

export const BrushIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m14 4 6 6-9.5 9.5a3.54 3.54 0 0 1-5-5L14 4Z" />
    <path d="M5 21c-1.5-1-1.5-3 0-4" />
  </IconBase>
);

export const FillIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="m9 3 9 9-6 6a3 3 0 0 1-4.24 0l-4.76-4.76a3 3 0 0 1 0-4.24L9 3Z" />
    <path d="M5.5 9.5h11" />
    <path d="M19.5 14.5s2 2.4 2 4a2 2 0 0 1-4 0c0-1.6 2-4 2-4Z" />
  </IconBase>
);

export const TypeIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M4 6h16M12 6v13M8 19h8" />
  </IconBase>
);

export const UndoIcon = (props: IconProps) => (
  <IconBase {...props}>
    <path d="M9 7 4 12l5 5" />
    <path d="M4 12h9a6 6 0 0 1 6 6v2" />
  </IconBase>
);
