import React, { useState, useCallback } from 'react';
import { Upload, Image, X, Plus } from 'lucide-react';
import type { MaterialItem } from '../types';
import { api } from '../utils/api';

interface MaterialUploaderProps {
  type: 'pattern' | 'space';
  materials: MaterialItem[];
  onMaterialsChange: () => void;
}

const MaterialUploader: React.FC<MaterialUploaderProps> = ({ type, materials, onMaterialsChange }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState('');

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setFileName(file.name);
      setUploading(true);
      try {
        await api.materials.upload(file, type, file.name.replace(/\.[^/.]+$/, ''));
        onMaterialsChange();
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setUploading(false);
        setFileName('');
      }
    }
  }, [type, onMaterialsChange]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith('image/')) {
      setFileName(file.name);
      setUploading(true);
      try {
        await api.materials.upload(file, type, file.name.replace(/\.[^/.]+$/, ''));
        onMaterialsChange();
      } catch (error) {
        console.error('Upload failed:', error);
      } finally {
        setUploading(false);
        setFileName('');
      }
    }
  }, [type, onMaterialsChange]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.materials.delete(id);
      onMaterialsChange();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [onMaterialsChange]);

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300 ${
          isDragging
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
      >
        <input
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
          id={`upload-${type}`}
        />
        <label
          htmlFor={`upload-${type}`}
          className="cursor-pointer flex flex-col items-center gap-3"
        >
          <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors ${
            isDragging ? 'bg-blue-500 text-white' : 'bg-blue-100 text-blue-600'
          }`}>
            <Upload className="w-8 h-8" />
          </div>
          <div>
            <p className="font-medium text-gray-700">
              {type === 'pattern' ? '上传保护垫图案' : '上传空间效果'}
            </p>
            <p className="text-sm text-gray-500">拖拽图片到此处或点击选择文件</p>
          </div>
        </label>
        {uploading && (
          <p className="mt-3 text-blue-600">正在上传: {fileName}...</p>
        )}
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
        {materials.map((item) => (
          <div
            key={item.id}
            className="relative group rounded-lg overflow-hidden border-2 border-gray-200 hover:border-blue-400 transition-colors"
          >
            <img
              src={item.url}
              alt={item.name}
              className="w-full aspect-square object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <button
                onClick={() => handleDelete(item.id)}
                className="p-2 bg-white rounded-full text-red-500 hover:bg-red-50 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
              <p className="text-white text-xs truncate">{item.name}</p>
            </div>
          </div>
        ))}
        {materials.length === 0 && (
          <div className="col-span-full text-center py-8 text-gray-400">
            <Image className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>暂无{type === 'pattern' ? '保护垫图案' : '空间效果'}素材</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MaterialUploader;