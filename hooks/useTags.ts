// hooks/useTags.ts

import { useState, useEffect, useCallback } from 'react';
import { Tag } from '@/types';

export function useTags() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTags = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/tags');
      if (!res.ok) throw new Error('Erro ao buscar tags');
      const data = await res.json();
      setTags(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createTag = useCallback(async (tag: Omit<Tag, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tag),
      });
      if (!res.ok) throw new Error('Erro ao criar tag');
      const newTag = await res.json();
      setTags(prev => [...prev, newTag]);
      return newTag;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updateTag = useCallback(async (id: string, updates: Partial<Omit<Tag, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Erro ao atualizar tag');
      const updated = await res.json();
      setTags(prev => prev.map(t => t.id === id ? updated : t));
      return updated;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const deleteTag = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/tags/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir tag');
      setTags(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchTags();
  }, [fetchTags]);

  return { tags, loading, error, createTag, updateTag, deleteTag, refetch: fetchTags };
}