'use client';

import { PosterSkeleton } from "@/components/AsyncState";

export default function Loading() {
  return (
    <div className="section">
      <div className="mc-skeleton mc-skeleton-eyebrow" />
      <div className="mc-skeleton mc-skeleton-heading" />
      <div className="mc-skeleton mc-skeleton-copy" />
      <div style={{ marginTop: 22 }}>
        <PosterSkeleton count={12} />
      </div>
    </div>
  );
}