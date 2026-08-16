// hooks/useLists.ts

import { useState, useEffect, useCallback } from 'react';
import { List } from '@/types';

export function useLists() {
  const [lists, setLists] = useState<List[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLists = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/lists');
      if (!res.ok) throw new Error('Erro ao buscar listas');
      const data = await res.json();
      setLists(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createList = useCallback(async (list: Omit<List, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
    try {
      const res = await fetch('/api/lists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(list),
      });
      if (!res.ok) throw new Error('Erro ao criar lista');
      const newList = await res.json();
      setLists(prev => [...prev, newList]);
      return newList;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const updateList = useCallback(async (id: string, updates: Partial<Omit<List, 'id' | 'user_id' | 'created_at' | 'updated_at'>>) => {
    try {
      const res = await fetch(`/api/lists/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Erro ao atualizar lista');
      const updated = await res.json();
      setLists(prev => prev.map(l => l.id === id ? updated : l));
      return updated;
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  const deleteList = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/lists/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir lista');
      setLists(prev => prev.filter(l => l.id !== id));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  }, []);

  useEffect(() => {
    fetchLists();
  }, [fetchLists]);

  return { lists, loading, error, createList, updateList, deleteList, refetch: fetchLists };
}