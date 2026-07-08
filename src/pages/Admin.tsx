import React, { useState, useEffect } from 'react';
import { Bot, LayoutGrid } from 'lucide-react';
import AISettingsManager from '../components/AISettingsManager';
import PresetPromptsManager from '../components/PresetPromptsManager';
import { api } from '../utils/api';
import type { AISettings } from '../types';

type TabType = 'ai-settings' | 'preset-prompts';

const Admin: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('ai-settings');
  const [settings, setSettings] = useState<AISettings | null>(null);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await api.settings.get();
      setSettings(data.settings);
    } catch (error) {
      console.error('Failed to load AI settings:', error);
    }
  };

  const tabs = [
    { id: 'ai-settings' as TabType, label: 'AI 配置', icon: Bot },
    { id: 'preset-prompts' as TabType, label: '示例模板管理', icon: LayoutGrid },
  ];

  return (
    <div className="h-full flex flex-col">
      <div className="flex border-b border-gray-200 bg-white">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-semibold transition ${
              activeTab === tab.id
                ? 'border-b-2 border-blue-600 text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-white rounded-xl border border-gray-200 p-6 overflow-hidden">
            {activeTab === 'ai-settings' && (
              <AISettingsManager settings={settings} onSettingsChange={loadSettings} />
            )}
            {activeTab === 'preset-prompts' && (
              <PresetPromptsManager />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Admin;