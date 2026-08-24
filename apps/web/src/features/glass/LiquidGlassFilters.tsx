export function LiquidGlassFilters() {
  return (
    <svg className="liquid-glass-filter-defs" aria-hidden="true" focusable="false">
      <defs>
        <filter
          id="yange-liquid-edge"
          x="-0.08"
          y="-0.08"
          width="1.16"
          height="1.16"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.006 0.012"
            numOctaves="1"
            seed="17"
            result="edgeField"
          />
          <feGaussianBlur in="edgeField" stdDeviation="2.2" result="softEdgeField" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softEdgeField"
            scale="7"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
