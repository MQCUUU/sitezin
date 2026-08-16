// components/TagForm.tsx

'use client';

import { useState } from 'react';
import { Tag } from '@/types';

interface TagFormProps {
  initialData?: Partial<Tag>;
  onSubmit: (data: Omit<Tag, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onCancel?: () => void;
  isLoading?: boolean;
}

export default function TagForm({ initialData, onSubmit, onCancel, isLoading = false }: TagFormProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [color, setColor] = useState(initialData?.color || '#3b82f6');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Nome é obrigatório');
      return;
    }
    setError('');
    try {
      await onSubmit({ name: name.trim(), description: description.trim() || undefined, color });
    } catch (err) {
      setError('Erro ao salvar. Tente novamente.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-4 bg-gray-800 rounded-lg">
      {error && <div className="text-red-500 text-sm">{error}</div>}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-300">Nome *</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white px-3 py-2"
          disabled={isLoading}
          required
        />
      </div>
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-300">Descrição</label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-md bg-gray-700 border-gray-600 text-white px-3 py-2"
          disabled={isLoading}
        />
      </div>
      <div>
        <label htmlFor="color" className="block text-sm font-medium text-gray-300">Cor</label>
        <input
          id="color"
          type="color"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          className="mt-1 block w-full h-10 rounded-md bg-gray-700 border-gray-600"
          disabled={isLoading}
        />
      </div>
      <div className="flex justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
            disabled={isLoading}
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
          disabled={isLoading}
        >
          {isLoading ? 'Salvando...' : initialData?.id ? 'Atualizar' : 'Criar'}
        </button>
      </div>
    </form>
  );
}