import React from 'react';
import { Check } from 'lucide-react';
import type { MaterialItem } from '../types';

interface MaterialSelectorProps {
  title: string;
  materials: MaterialItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  type: 'pattern' | 'space';
}

const MaterialSelector: React.FC<MaterialSelectorProps> = ({
  title,
  materials,
  selectedId,
  onSelect,
  type,
}) => {
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      <div className="grid grid-cols-4 gap-3">
        {materials.map((item) => (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
              selectedId === item.id
                ? 'border-blue-500 ring-2 ring-blue-200'
                : 'border-gray-200 hover:border-blue-300'
            }`}
          >
            <img
              src={item.url}
              alt={item.name}
              className="w-full h-full object-cover"
            />
            {selectedId === item.id && (
              <div className="absolute top-1 right-1 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                <Check className="w-4 h-4 text-white" />
              </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1">
              <p className="text-white text-xs truncate">{item.name}</p>
            </div>
          </button>
        ))}
        {materials.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400 text-sm">
            请先在管理端上传{type === 'pattern' ? '保护垫图案' : '空间效果'}素材
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialSelector;