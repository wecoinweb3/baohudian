import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { AISettings } from '../types';
import { api } from '../utils/api';

type AISettingsManagerProps = {
  settings: AISettings | null;
  onSettingsChange: () => void;
};

export default function AISettingsManager({ settings, onSettingsChange }: AISettingsManagerProps) {
  const [form, setForm] = useState<AISettings>({
    canvasApiKey: '',
    canvasBaseUrl: '',
    canvasModel: 'gpt-4o-mini',
    canvasTemperature: 0.2,
    canvasSystemPrompt: '',
  });
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (settings) {
      setForm(settings);
    }
  }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleSave = async () => {
    setIsSaving(true);
    setToast(null);

    try {
      await api.settings.save(form);
      setToast({ type: 'success', text: 'AI 配置已保存' });
      onSettingsChange();
    } catch (error) {
      setToast({ type: 'error', text: `保存失败：${(error as Error).message}` });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <label className="space-y-2">
          <div className="text-sm font-semibold text-slate-800">Base URL</div>
          <input
            value={form.canvasBaseUrl}
            onChange={(event) => setForm((current) => ({ ...current, canvasBaseUrl: event.target.value }))}
            className="w-full border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
            placeholder="例如：https://api.openai.com/v1"
          />
        </label>

        <label className="space-y-2">
          <div className="text-sm font-semibold text-slate-800">API Key</div>
          <input
            type="password"
            value={form.canvasApiKey}
            onChange={(event) => setForm((current) => ({ ...current, canvasApiKey: event.target.value }))}
            className="w-full border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
            placeholder="请输入 API Key"
          />
        </label>

        <label className="space-y-2">
          <div className="text-sm font-semibold text-slate-800">模型名称</div>
          <input
            value={form.canvasModel}
            onChange={(event) => setForm((current) => ({ ...current, canvasModel: event.target.value }))}
            className="w-full border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
            placeholder="例如：gpt-4o-mini"
          />
        </label>
        <label className="space-y-2">
          <div className="text-sm font-semibold text-slate-800">温度（0 ~ 2）</div>
          <input
            type="number"
            min={0}
            max={2}
            step={0.1}
            value={form.canvasTemperature}
            onChange={(event) => setForm((current) => ({ ...current, canvasTemperature: Number(event.target.value) || 0 }))}
            className="w-full border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-blue-500"
          />
        </label>
      </div>

      <label className="space-y-2 block">
        <div className="text-sm font-semibold text-slate-800">系统提示词</div>
        <textarea
          value={form.canvasSystemPrompt}
          onChange={(event) => setForm((current) => ({ ...current, canvasSystemPrompt: event.target.value }))}
          className="min-h-[360px] w-full border border-slate-200 px-3 py-3 text-sm leading-7 outline-none transition focus:border-blue-500"
          placeholder="请输入系统提示词"
        />
      </label>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm text-slate-500">保存后默认对话页会直接读取最新配置。</div>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="inline-flex items-center justify-center gap-2 bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Save className="h-4 w-4" />
          {isSaving ? '保存中...' : '保存 AI 配置'}
        </button>
      </div>

      {toast && (
        <div className="pointer-events-none fixed right-6 top-6 z-[100]">
          <div className={`min-w-[260px] max-w-[360px] shadow-lg px-4 py-3 text-sm font-medium text-white ${toast.type === 'success' ? 'bg-slate-900' : 'bg-red-600'}`}>
            {toast.text}
          </div>
        </div>
      )}
    </div>
  );
}