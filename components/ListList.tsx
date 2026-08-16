// components/ListList.tsx

'use client';

import { List } from '@/types';
import { useState } from 'react';

interface ListListProps {
  lists: List[];
  onEdit: (list: List) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function ListList({ lists, onEdit, onDelete }: ListListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta lista?')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (lists.length === 0) {
    return <div className="text-gray-400">Nenhuma lista criada ainda.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {lists.map((list) => (
        <div key={list.id} className="bg-gray-800 p-4 rounded-lg shadow flex items-center justify-between">
          <div>
            <h3 className="font-medium text-white">{list.name}</h3>
            {list.description && <p className="text-sm text-gray-400">{list.description}</p>}
            <span className="text-xs text-gray-500">{list.is_public ? 'Pública' : 'Privada'}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(list)}
              className="text-gray-400 hover:text-white text-sm"
            >
              Editar
            </button>
            <button
              onClick={() => handleDelete(list.id)}
              disabled={deletingId === list.id}
              className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
            >
              {deletingId === list.id ? '...' : 'Excluir'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}