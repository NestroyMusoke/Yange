import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { YangeView } from "../judge/JudgeMode";
import { YangeNavigation } from "./YangeNavigation";

const views: YangeView[] = [
  "today",
  "studio",
  "atelier",
  "wearcast",
  "cloud",
  "judge",
  "activity",
];

describe("YangeNavigation", () => {
  it.each(views)("uses the same navigation contract when %s is active", (activeView) => {
    const markup = renderToStaticMarkup(
      <YangeNavigation activeView={activeView} indicators={{}} onNavigate={() => undefined} />,
    );

    expect(markup.match(/<button/g)).toHaveLength(7);
    expect(markup.match(/aria-current="page"/g)).toHaveLength(1);
    expect(markup.match(/<svg/g)).toHaveLength(7);
    expect(markup.match(/stroke-width="1.25"/g)).toHaveLength(7);
    expect(markup).not.toContain("<img");
  });
});
