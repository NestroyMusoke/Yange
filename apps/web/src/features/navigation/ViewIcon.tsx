import type { YangeView } from "../judge/JudgeMode";

function IconFrame({ children }: { children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <g
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.25"
      >
        {children}
      </g>
    </svg>
  );
}

export function ViewIcon({ view }: { view: YangeView }) {
  switch (view) {
    case "today":
      return (
        <IconFrame>
          <path d="M8.6 5.1c0-1.2.7-2 1.7-2 .9 0 1.6.6 1.6 1.5 0 1.4-1.9 1.5-1.9 3" />
          <path d="M10 7.6 3.2 12c-.6.4-.4 1.4.4 1.4h12.8c.8 0 1.1-1 .4-1.4L10 7.6Z" />
          <path d="M5.2 12.1h9.6" />
        </IconFrame>
      );
    case "studio":
      return (
        <IconFrame>
          <path d="m3.2 8.3 5.4-5.1h6.7c.8 0 1.5.7 1.5 1.5v6.7l-5.4 5.4a1.5 1.5 0 0 1-2.1 0l-6.1-6.4a1.5 1.5 0 0 1 0-2.1Z" />
          <circle cx="13.5" cy="6.5" r="1" />
          <path d="m6.2 9.5 4.3 4.3M7.6 8.2l4.2 4.3" strokeDasharray="1.2 1.6" />
        </IconFrame>
      );
    case "atelier":
      return (
        <IconFrame>
          <path d="M5 3.3h6.2M5 16.7h6.2M6.2 4.2v11.6M10 4.2v11.6" />
          <path d="M6.3 6.1h3.6M6.3 8h3.6M6.3 9.9h3.6M6.3 11.8h3.6M6.3 13.7h3.6" />
          <path d="M11.2 5.2c4 .4 5.1 2.9 4.6 5.2-.5 2.1-2.2 3-4.7 2.3" />
          <path d="m15.1 11.6 1.5 2.1" />
        </IconFrame>
      );
    case "wearcast":
      return (
        <IconFrame>
          <path d="M5.2 14.8h9.3a3 3 0 0 0 .2-6 4.8 4.8 0 0 0-9.1-1.2 3.6 3.6 0 0 0-.4 7.2Z" />
          <path d="M6.1 11.6c1 .7 1.8.7 2.7 0s1.8-.7 2.7 0 1.8.7 2.7 0" strokeDasharray="1.3 1.4" />
        </IconFrame>
      );
    case "cloud":
      return (
        <IconFrame>
          <path d="M4.8 14.8h9.8a2.9 2.9 0 0 0 .1-5.8 4.8 4.8 0 0 0-9.2-1.2 3.5 3.5 0 0 0-.7 7Z" />
          <path d="m7.2 11.4 1.8 1.8 3.8-4" />
        </IconFrame>
      );
    case "judge":
      return (
        <IconFrame>
          <circle cx="8.6" cy="8.6" r="5.1" />
          <path d="m12.3 12.3 4.2 4.2M5.7 6.2l5.6 5.3M7.5 4.2l5.4 5.2M4.2 8l4.8 4.6" strokeDasharray="1.2 1.3" />
        </IconFrame>
      );
    case "activity":
      return (
        <IconFrame>
          <path d="M2.8 10h3l1.4-3.2 2.5 6.4 2.2-5.1 1.3 1.9h4" />
          <path d="m15.7 8.7 1.5 1.3-1.5 1.3" />
        </IconFrame>
      );
  }
}
