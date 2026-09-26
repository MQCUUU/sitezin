"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";

export function CarouselRail({ children, className = "" }: { children: ReactNode; className?: string }) {
  const railRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });
  const updateEdges = useCallback(() => {
    const rail = railRef.current;
    if (!rail) return;
    setEdges({
      start: rail.scrollLeft <= 4,
      end: rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 4,
    });
  }, []);
  const move = (direction: -1 | 1) => {
    const rail = railRef.current;
    if (!rail) return;
    rail.scrollBy({ left: direction * Math.max(rail.clientWidth * 0.82, 280), behavior: "smooth" });
  };

  useEffect(() => {
    updateEdges();
    const rail = railRef.current;
    if (!rail) return;
    const observer = new ResizeObserver(updateEdges);
    observer.observe(rail);
    /*
     * ResizeObserver only reacts to the rail's own box changing, not to
     * its content settling (e.g. a single-item rail whose scrollWidth is
     * already final on mount but got measured before the browser's first
     * paint). One extra post-paint check keeps the arrows correctly
     * disabled/hidden for content that doesn't overflow (LOW finding,
     * A3.2).
     */
    const raf = requestAnimationFrame(updateEdges);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [children, updateEdges]);

  return <div className="media-carousel">
    <button type="button" className="media-carousel-arrow previous" aria-label="Ver títulos anteriores" disabled={edges.start} onClick={() => move(-1)}><ChevronLeft/></button>
    <div ref={railRef} className={`media-carousel-rail ${className}`} onScroll={updateEdges}>{children}</div>
    <button type="button" className="media-carousel-arrow next" aria-label="Ver próximos títulos" disabled={edges.end} onClick={() => move(1)}><ChevronRight/></button>
  </div>;
}
