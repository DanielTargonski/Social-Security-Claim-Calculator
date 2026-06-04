import { useCallback, useLayoutEffect, useRef, useState } from "react";

// Reusable segmented control with a measured sliding indicator. A single
// absolutely-positioned "thumb" animates to sit behind the active option, so
// switching slides the accent fill instead of snapping to it. Option widths are
// measured (offsetLeft/Width) rather than assumed equal, so labels of different
// lengths still line up. Buttons keep the .mode-btn / .mode-btn-active classes
// so the shared segmented-control styling (and the tests that key off those
// classes) stay valid; the .segment-sliding modifier hands the fill to the
// thumb. See GlobalStyles for .segment-thumb / .segment-sliding.
export default function Segment({ options, value, onChange, className = "" }) {
  const containerRef = useRef(null);
  const btnRefs = useRef({});
  const [thumb, setThumb] = useState(null);

  const measure = useCallback(() => {
    const el = btnRefs.current[value];
    if (!el) return;
    setThumb({
      left: el.offsetLeft,
      top: el.offsetTop,
      width: el.offsetWidth,
      height: el.offsetHeight,
    });
  }, [value]);

  // Position the thumb synchronously before paint whenever the selection (or
  // the option set) changes — already in place on first render (no flash),
  // animated on later changes.
  useLayoutEffect(() => {
    measure();
  }, [measure, options]);

  // Re-measure when the viewport resizes, the container resizes, or web fonts
  // finish loading (Inter swapping in shifts label widths).
  useLayoutEffect(() => {
    window.addEventListener("resize", measure);
    let ro;
    if (typeof ResizeObserver !== "undefined" && containerRef.current) {
      ro = new ResizeObserver(() => measure());
      ro.observe(containerRef.current);
    }
    if (typeof document !== "undefined" && document.fonts && document.fonts.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, [measure]);

  return (
    <div
      ref={containerRef}
      className={`segment segment-sliding flex-wrap ${className}`.trim()}
    >
      {thumb && (
        <span
          className="segment-thumb"
          aria-hidden="true"
          style={{
            transform: `translate(${thumb.left}px, ${thumb.top}px)`,
            width: `${thumb.width}px`,
            height: `${thumb.height}px`,
          }}
        />
      )}
      {options.map((opt) => (
        <button
          key={opt.key}
          ref={(node) => {
            btnRefs.current[opt.key] = node;
          }}
          type="button"
          onClick={() => onChange(opt.key)}
          className={`mode-btn ${value === opt.key ? "mode-btn-active" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
