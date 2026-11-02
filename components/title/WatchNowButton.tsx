'use client';

import React from 'react';
import { Play } from 'lucide-react';
import { useUncensoredMode } from '@/lib/uncensored-mode';

export interface WatchNowButtonProps {
  type: 'movie' | 'tv';
  id: number | string;
  title: string;
  year?: string | number;
  releaseDate?: string;
  className?: string;
  children?: React.ReactNode;
}

export function WatchNowButton({
  type,
  id,
  title,
  year,
  releaseDate,
  className = 'btn primary title-main-btn',
  children,
}: WatchNowButtonProps) {
  const [enabled, , mounted] = useUncensoredMode();

  // O botão só aparece se o Modo Sem Censura estiver ativado
  if (!mounted || !enabled) {
    return null;
  }

  // Extrai os 4 dígitos do ano (a partir de year ou de uma data completa como "2024-05-10")
  const rawDate =
    year !== undefined && year !== null && String(year).trim() !== ''
      ? String(year)
      : releaseDate || '';

  const match = rawDate.match(/\d{4}/);
  const resolvedYear = match ? match[0] : '';

  const params = new URLSearchParams();
  params.set('type', type);
  params.set('id', String(id));

  if (title && title.trim()) {
    params.set('title', title.trim());
  }

  if (resolvedYear) {
    params.set('year', resolvedYear);
  }

  return (
    <a
      className={className}
      href={`/api/resolve-link?${params.toString()}`}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Play size={18} fill="currentColor" aria-hidden="true" />
      {children ?? 'Assistir agora'}
    </a>
  );
}

export default WatchNowButton;
