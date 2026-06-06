import { useEffect, useMemo, useRef, useState } from "react";

function useActiveSection(items) {
  const ids = useMemo(() => items.map((item) => item.id), [items]);
  const idsKey = ids.join("|");
  const [activeId, setActiveId] = useState(ids[0] ?? null);

  useEffect(() => {
    const targets = ids
      .map((id) => document.getElementById(id))
      .filter(Boolean);
    if (!targets.length || !("IntersectionObserver" in window)) return;

    const visibleEntries = new Map();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            visibleEntries.set(entry.target.id, entry);
          } else {
            visibleEntries.delete(entry.target.id);
          }
        });

        const nearest = [...visibleEntries.values()].sort(
          (a, b) =>
            Math.abs(a.boundingClientRect.top - 96) -
            Math.abs(b.boundingClientRect.top - 96)
        )[0];

        if (nearest) setActiveId(nearest.target.id);
      },
      {
        rootMargin: "-88px 0px -58% 0px",
        threshold: [0, 0.1, 0.35, 0.7],
      }
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [ids, idsKey]);

  return [ids.includes(activeId) ? activeId : ids[0] ?? null, setActiveId];
}

export default function JumpNav({ items }) {
  const [activeId, setActiveId] = useActiveSection(items);
  const linkRefs = useRef(new Map());

  useEffect(() => {
    const link = linkRefs.current.get(activeId);
    if (!link?.scrollIntoView) return;
    const reduceMotion = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    link.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeId]);

  if (!items.length) return null;

  return (
    <nav className="jump-nav-wrap" aria-label="Calculator sections">
      <div className="jump-nav">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <a
              key={item.id}
              ref={(node) => {
                if (node) linkRefs.current.set(item.id, node);
                else linkRefs.current.delete(item.id);
              }}
              href={`#${item.id}`}
              className="jump-nav-link"
              aria-current={active ? "location" : undefined}
              onClick={() => setActiveId(item.id)}
            >
              {item.label}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
