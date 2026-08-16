// components/TagList.tsx

'use client';

import { Tag } from '@/types';
import { useState } from 'react';

interface TagListProps {
  tags: Tag[];
  onEdit: (tag: Tag) => void;
  onDelete: (id: string) => Promise<void>;
}

export default function TagList({ tags, onEdit, onDelete }: TagListProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta tag?')) return;
    setDeletingId(id);
    try {
      await onDelete(id);
    } finally {
      setDeletingId(null);
    }
  };

  if (tags.length === 0) {
    return <div className="text-gray-400">Nenhuma tag criada ainda.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {tags.map((tag) => (
        <div key={tag.id} className="bg-gray-800 p-4 rounded-lg shadow flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-4 h-4 rounded-full" style={{ backgroundColor: tag.color || '#3b82f6' }} />
            <div>
              <h3 className="font-medium text-white">{tag.name}</h3>
              {tag.description && <p className="text-sm text-gray-400">{tag.description}</p>}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => onEdit(tag)}
              className="text-gray-400 hover:text-white text-sm"
            >
              Editar
            </button>
            <button
              onClick={() => handleDelete(tag.id)}
              disabled={deletingId === tag.id}
              className="text-red-400 hover:text-red-300 text-sm disabled:opacity-50"
            >
              {deletingId === tag.id ? '...' : 'Excluir'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}