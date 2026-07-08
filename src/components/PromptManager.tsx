import React, { useState, useCallback } from 'react';
import { Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import type { PromptItem } from '../types';
import { api } from '../utils/api';

interface PromptManagerProps {
  prompts: PromptItem[];
  onPromptsChange: () => void;
}

const PromptManager: React.FC<PromptManagerProps> = ({ prompts, onPromptsChange }) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: '',
    content: '',
    category: '',
  });

  const categories = ['风格', '效果', '视角', '其他'];

  const handleSave = useCallback(async () => {
    if (!form.name || !form.content) return;

    try {
      await api.prompts.save({
        id: editingId || undefined,
        name: form.name,
        content: form.content,
        category: form.category || '其他',
      });
      onPromptsChange();
      setForm({ name: '', content: '', category: '' });
      setIsAdding(false);
      setEditingId(null);
    } catch (error) {
      console.error('Save failed:', error);
    }
  }, [form, editingId, onPromptsChange]);

  const handleEdit = useCallback((prompt: PromptItem) => {
    setForm({ name: prompt.name, content: prompt.content, category: prompt.category });
    setEditingId(prompt.id);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.prompts.delete(id);
      onPromptsChange();
    } catch (error) {
      console.error('Delete failed:', error);
    }
  }, [onPromptsChange]);

  const cancelEdit = () => {
    setForm({ name: '', content: '', category: '' });
    setEditingId(null);
    setIsAdding(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-800">提示词列表</h3>
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          添加提示词
        </button>
      </div>

      {isAdding && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="提示词名称"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="输入AI生成提示词..."
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      )}

      {editingId && !isAdding && (
        <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">名称</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
              <select
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button
              onClick={cancelEdit}
              className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
              取消
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Save className="w-4 h-4" />
              保存
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {prompts.map((prompt) => (
          <div
            key={prompt.id}
            className="bg-white rounded-lg p-4 border border-gray-200 hover:border-blue-300 transition-colors flex items-start justify-between"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-medium text-gray-800">{prompt.name}</span>
                <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-600 rounded-full">
                  {prompt.category}
                </span>
              </div>
              <p className="text-sm text-gray-600 truncate max-w-xl">{prompt.content}</p>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={() => handleEdit(prompt)}
                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleDelete(prompt.id)}
                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
        {prompts.length === 0 && (
          <div className="text-center py-8 text-gray-400">
            <p>暂无提示词，请添加</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default PromptManager;