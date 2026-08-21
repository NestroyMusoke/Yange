import type { YangeView } from "../judge/JudgeMode";

const iconAssets: Partial<Record<YangeView, string>> = {
  today: "/icons/nav-today.png",
  studio: "/icons/nav-studio.png",
  atelier: "/icons/nav-atelier.png",
  wearcast: "/icons/nav-wearcast.png",
  cloud: "/icons/nav-cloud.png",
  judge: "/icons/nav-judge.png",
};

export function ViewIcon({ view }: { view: YangeView }) {
  const asset = iconAssets[view];
  if (asset) {
    return <img src={asset} alt="" width="256" height="256" decoding="async" />;
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.55">
        <path d="M4 12h3l2-5 4 10 2-5h5" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="20" cy="12" r="1" />
      </g>
    </svg>
  );
}
