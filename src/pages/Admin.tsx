import React, { useState, useEffect } from 'react';
import { Upload, MessageSquare, Package } from 'lucide-react';
import MaterialUploader from '../components/MaterialUploader';
import PromptManager from '../components/PromptManager';
import { api } from '../utils/api';
import type { MaterialItem, PromptItem } from '../types';

type TabType = 'materials' | 'prompts';

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('materials');
  const [patterns, setPatterns] = useState<MaterialItem[]>([]);
  const [spaces, setSpaces] = useState<MaterialItem[]>([]);
  const [prompts, setPrompts] = useState<PromptItem[]>([]);

  useEffect(() => {
    loadMaterials();
    loadPrompts();
  }, []);

  const loadMaterials = async () => {
    try {
      const data = await api.materials.get();
      setPatterns(data.patterns);
      setSpaces(data.spaces);
    } catch (error) {
      console.error('Failed to load materials:', error);
    }
  };

  const loadPrompts = async () => {
    try {
      const data = await api.prompts.get();
      setPrompts(data.prompts);
    } catch (error) {
      console.error('Failed to load prompts:', error);
    }
  };

  const tabs = [
    { id: 'materials' as TabType, label: '素材管理', icon: Upload },
    { id: 'prompts' as TabType, label: '提示词配置', icon: MessageSquare },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <Package className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-800">管理端</h1>
                <p className="text-sm text-gray-500">管理素材和提示词配置</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex border-b border-gray-200">
              {tabs.map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex items-center justify-center gap-2 py-4 px-6 font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                        : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="p-6">
              {activeTab === 'materials' && (
                <div className="space-y-8">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <div className="w-1 h-6 bg-blue-500 rounded" />
                      保护垫图案素材
                    </h2>
                    <MaterialUploader
                      type="pattern"
                      materials={patterns}
                      onMaterialsChange={loadMaterials}
                    />
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                      <div className="w-1 h-6 bg-green-500 rounded" />
                      空间效果素材
                    </h2>
                    <MaterialUploader
                      type="space"
                      materials={spaces}
                      onMaterialsChange={loadMaterials}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'prompts' && (
                <PromptManager prompts={prompts} onPromptsChange={loadPrompts} />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;