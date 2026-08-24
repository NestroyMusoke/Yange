import { useEffect } from "react";
import {
  LiquidGlass,
  type GlassConfig,
} from "@ybouane/liquidglass";

interface LiquidGlassRuntimeProps {
  enabled: boolean;
  revision: string;
}

const REGULAR_GLASS: Partial<GlassConfig> = {
  blurAmount: 0.25,
  refraction: 0.69,
  chromAberration: 0.05,
  edgeHighlight: 0.05,
  specular: 0,
  fresnel: 1,
  distortion: 0,
  cornerRadius: 12,
  zRadius: 12,
  opacity: 1,
  saturation: 0,
  tintStrength: 0,
  brightness: 0,
  shadowOpacity: 0.3,
  shadowSpread: 10,
  shadowOffsetY: 1,
  floating: false,
  button: false,
  bevelMode: 0,
};

function configFor(element: HTMLElement): Partial<GlassConfig> {
  if (element.classList.contains("aura-chip")) {
    return {
      ...REGULAR_GLASS,
      button: true,
      shadowOpacity: 0.22,
      shadowSpread: 7,
    };
  }

  if (element.classList.contains("aura-panel")) {
    return {
      ...REGULAR_GLASS,
      blurAmount: 0.34,
      refraction: 0.58,
      shadowOpacity: 0.36,
      shadowSpread: 12,
    };
  }

  return REGULAR_GLASS;
}

function resizeAndCopyAura(
  source: HTMLCanvasElement,
  mirrors: HTMLCanvasElement[],
) {
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
  const width = Math.max(1, Math.round(window.innerWidth * pixelRatio));
  const height = Math.max(1, Math.round(window.innerHeight * pixelRatio));

  for (const mirror of mirrors) {
    if (mirror.width !== width || mirror.height !== height) {
      mirror.width = width;
      mirror.height = height;
    }

    const context = mirror.getContext("2d", { alpha: true });
    if (!context || source.width === 0 || source.height === 0) continue;
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, source.width, source.height, 0, 0, width, height);
  }
}

/**
 * React adapter for Ybouane's WebGL liquid-glass compositor.
 *
 * Every small glass stage receives an invisible, live mirror of Style Aura as
 * its first sibling. The reference engine samples that canvas directly, which
 * avoids repeatedly rasterising the full Yange application with html-to-image.
 */
export function LiquidGlassRuntime({ enabled, revision }: LiquidGlassRuntimeProps) {
  useEffect(() => {
    if (!enabled) return;

    let disposed = false;
    let animationFrame = 0;
    const instances = new Map<HTMLElement, LiquidGlass>();
    const generations = new Map<HTMLElement, number>();
    const mirrors: HTMLCanvasElement[] = [];
    const observers: MutationObserver[] = [];
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    async function initialise() {
      await document.fonts.ready;
      if (disposed) return;

      const auraCanvas = document.querySelector<HTMLCanvasElement>(".style-aura canvas");
      if (!auraCanvas) return;

      const stages = Array.from(
        document.querySelectorAll<HTMLElement>(".app-shell [data-liquid-glass-root]"),
      );

      for (const root of stages) {
        const mirror = document.createElement("canvas");
        mirror.className = "liquid-glass-aura-source";
        mirror.setAttribute("aria-hidden", "true");
        if (!reduceMotion) mirror.setAttribute("data-dynamic", "");
        root.insertBefore(mirror, root.firstChild);

        mirrors.push(mirror);
      }

      if (mirrors.length === 0) return;

      const copyFrame = () => {
        if (disposed) return;
        if (!document.hidden) resizeAndCopyAura(auraCanvas, mirrors);
        if (!reduceMotion) animationFrame = window.requestAnimationFrame(copyFrame);
      };
      copyFrame();

      async function initialiseRoot(root: HTMLElement) {
        const generation = (generations.get(root) ?? 0) + 1;
        generations.set(root, generation);
        instances.get(root)?.destroy();
        instances.delete(root);
        root.classList.remove("liquid-glass-ready");
        Array.from(root.children).forEach((child) => {
          if (!(child instanceof HTMLElement)) return;
          child.classList.remove("liquid-glass-rendered");
          if (child.hasAttribute("data-liquid-glass")) delete child.dataset.config;
        });

        const glassElements = Array.from(root.children).filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.hasAttribute("data-liquid-glass"),
        );
        if (glassElements.length === 0) return;

        for (const element of glassElements) {
          element.dataset.config = JSON.stringify(configFor(element));
        }

        try {
          const instance = await LiquidGlass.init({
            root,
            glassElements,
            defaults: REGULAR_GLASS,
          });
          if (disposed || generations.get(root) !== generation) {
            instance.destroy();
            return;
          }
          instances.set(root, instance);
          root.classList.add("liquid-glass-ready");
          glassElements.forEach((element) => element.classList.add("liquid-glass-rendered"));
        } catch (error) {
          console.warn("Yange liquid glass fell back to CSS rendering.", error);
        }
      }

      await Promise.all(stages.map((root) => initialiseRoot(root)));
      if (disposed) return;

      for (const root of stages) {
        let reinitialiseFrame = 0;
        const observer = new MutationObserver((mutations) => {
          const glassStructureChanged = mutations.some((mutation) =>
            [...mutation.addedNodes, ...mutation.removedNodes].some(
              (node) => node instanceof HTMLElement && node.hasAttribute("data-liquid-glass"),
            ),
          );
          if (!glassStructureChanged) return;
          window.cancelAnimationFrame(reinitialiseFrame);
          reinitialiseFrame = window.requestAnimationFrame(() => void initialiseRoot(root));
        });
        observer.observe(root, { childList: true });
        observers.push(observer);
      }
    }

    void initialise();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      observers.forEach((observer) => observer.disconnect());
      instances.forEach((instance, root) => {
        instance.destroy();
        root.classList.remove("liquid-glass-ready");
      });
      document.querySelectorAll<HTMLElement>(".liquid-glass-rendered").forEach((element) => {
        element.classList.remove("liquid-glass-rendered");
        delete element.dataset.config;
      });
      mirrors.forEach((mirror) => mirror.remove());
    };
  }, [enabled, revision]);

  return null;
}
