import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { YangeText, YangeWordmark } from "./YangeWordmark";

describe("YangeWordmark", () => {
  it("normalises every supplied casing to the canonical lowercase wordmark", () => {
    expect(renderToStaticMarkup(<YangeWordmark>YANGE</YangeWordmark>))
      .toBe('<span class="yange-wordmark">yange</span>');
  });

  it("uses the same wordmark inside running product copy", () => {
    const markup = renderToStaticMarkup(<YangeText>Let Yange learn with you.</YangeText>);

    expect(markup).toContain('<span class="yange-wordmark">yange</span>');
    expect(markup).not.toContain(">Yange<");
  });
});
