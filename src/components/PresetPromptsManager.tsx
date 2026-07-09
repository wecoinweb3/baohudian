import { useEffect, useState } from 'react';
import { ImageIcon, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { api } from '../utils/api';

type Preset = {
  id: string;
  title: string;
  prompt: string;
  thumbnailUrl: string;
  sortOrder: number;
  enabled: boolean;
};

type EditingPreset = Omit<Preset, 'sortOrder'> & { sortOrder: number; isNew?: boolean };

const emptyPreset = (): EditingPreset => ({
  id: '',
  title: '',
  prompt: '',
  thumbnailUrl: '',
  sortOrder: 99,
  enabled: true,
  isNew: true,
});

export default function PresetPromptsManager() {
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditingPreset | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [zoomImage, setZoomImage] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const load = async () => {
    setLoading(true);
    try {
      const result = await api.presetPrompts.list();
      if (result.success) setPresets(result.presets);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (preset: Preset) => {
    setEditing({ ...preset, isNew: false });
  };

  const startNew = () => {
    setEditing({ ...emptyPreset(), sortOrder: presets.length + 1 });
  };

  const cancelEdit = () => setEditing(null);

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.title.trim()) { setToast({ type: 'error', text: '模板名称不能为空' }); return; }
    if (!editing.prompt.trim()) { setToast({ type: 'error', text: '提示词不能为空' }); return; }

    setSaving(true);
    try {
      await api.presetPrompts.save({
        id: editing.isNew ? undefined : editing.id,
        title: editing.title,
        prompt: editing.prompt,
        thumbnailUrl: editing.thumbnailUrl,
        sortOrder: editing.sortOrder,
        enabled: editing.enabled,
      });
      setToast({ type: 'success', text: editing.isNew ? '模板已新增' : '模板已保存' });
      setEditing(null);
      await load();
    } catch (e) {
      setToast({ type: 'error', text: `保存失败：${(e as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      await api.presetPrompts.delete(id);
      setToast({ type: 'success', text: '模板已删除' });
      await load();
    } catch (e) {
      setToast({ type: 'error', text: `删除失败：${(e as Error).message}` });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-800">示例模板列表</div>
          <div className="mt-0.5 text-xs text-slate-400">对话页"示例模板"弹框中展示的模板，支持增删改排序。</div>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-2 border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:bg-blue-600 hover:text-white"
        >
          <Plus className="h-4 w-4" />
          新增模板
        </button>
      </div>

      {/* 模板卡片列表 */}
      {loading ? (
        <div className="py-12 text-center text-sm text-slate-400">加载中…</div>
      ) : presets.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-400">暂无模板，点击右上角新增</div>
      ) : (
        <div className="space-y-3">
          {presets.map((preset) => (
            <div key={preset.id} className="flex gap-4 border border-slate-200 bg-white p-4">
              {/* 缩略图 */}
              <div className="shrink-0">
                {preset.thumbnailUrl ? (
                  <button
                    type="button"
                    onClick={() => setZoomImage(preset.thumbnailUrl)}
                    className="block h-20 w-32 overflow-hidden border border-slate-200 bg-slate-50"
                    title="点击放大"
                  >
                    <img src={preset.thumbnailUrl} alt={preset.title} className="h-full w-full object-cover transition hover:scale-105" />
                  </button>
                ) : (
                  <div className="flex h-20 w-32 items-center justify-center border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                    <ImageIcon className="h-6 w-6" />
                  </div>
                )}
              </div>

              {/* 内容区 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-800">{preset.title}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold ${preset.enabled ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                      {preset.enabled ? '可用' : '禁用'}
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(preset)}
                      className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-blue-300 hover:text-blue-600"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      编辑
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(preset.id)}
                      disabled={deleting === preset.id}
                      className="inline-flex items-center gap-1.5 border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-400 transition hover:border-red-300 hover:text-red-500 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {deleting === preset.id ? '删除中…' : '删除'}
                    </button>
                  </div>
                </div>
                {/* 提示词预览 */}
                <div className="mt-2 max-h-20 overflow-hidden">
                  <pre className="whitespace-pre-wrap text-xs leading-5 text-slate-500 font-sans">{preset.prompt}</pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 编辑抽屉（遮罩 + 侧板） */}
      {editing && (
        <div className="fixed inset-0 z-50 flex">
          {/* 背景遮罩 */}
          <div className="flex-1 bg-slate-950/30" onClick={cancelEdit} />

          {/* 侧边面板 */}
          <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
            {/* 面板头 */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div className="font-semibold text-slate-900">{editing.isNew ? '新增示例模板' : '编辑示例模板'}</div>
              <button type="button" onClick={cancelEdit} className="text-slate-400 hover:text-slate-700">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 面板内容 */}
            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* 缩略图预览 */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">缩略图路径</div>
                <div className="flex gap-3">
                  <input
                    value={editing.thumbnailUrl}
                    onChange={(e) => setEditing((cur) => cur && ({ ...cur, thumbnailUrl: e.target.value }))}
                    className="flex-1 border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                    placeholder="例如：/moban/1.jpg"
                  />
                  {editing.thumbnailUrl && (
                    <button
                      type="button"
                      onClick={() => setZoomImage(editing.thumbnailUrl)}
                      className="shrink-0 border border-slate-200 px-3 text-xs text-slate-500 hover:border-blue-300 hover:text-blue-600"
                    >
                      预览
                    </button>
                  )}
                </div>
                {editing.thumbnailUrl && (
                  <img
                    src={editing.thumbnailUrl}
                    alt="缩略图预览"
                    className="h-24 w-full border border-slate-100 bg-slate-50 object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                )}
              </div>

              {/* 模板名称 */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">模板名称 <span className="text-red-500">*</span></div>
                <input
                  value={editing.title}
                  onChange={(e) => setEditing((cur) => cur && ({ ...cur, title: e.target.value }))}
                  className="w-full border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                  placeholder="例如：促销红色款"
                />
              </div>

              {/* 提示词 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-slate-700">提示词内容 <span className="text-red-500">*</span></div>
                  <div className="text-xs text-slate-400">每行为一个描述维度，方便用户修改</div>
                </div>
                <textarea
                  value={editing.prompt}
                  onChange={(e) => setEditing((cur) => cur && ({ ...cur, prompt: e.target.value }))}
                  className="min-h-[280px] w-full border border-slate-200 px-3 py-3 text-sm leading-6 outline-none focus:border-blue-500 font-mono"
                  placeholder={`建议按维度分行书写，例如：\n画布规格：120×70，安全区域 84×40\n背景颜色：白色\n顶部标题："夏季大促"，红色，居中\n底部色条：红色横条\n产品图：居中偏上`}
                  spellCheck={false}
                />
                <div className="text-xs text-slate-400">
                  提示：换行书写让用户点击模板后可以逐行看清各参数，便于修改。
                </div>
              </div>

              {/* 排序 */}
              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">排序权重（数字小靠前）</div>
                <input
                  type="number"
                  value={editing.sortOrder}
                  onChange={(e) => setEditing((cur) => cur && ({ ...cur, sortOrder: Number(e.target.value) || 0 }))}
                  className="w-32 border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-2">
                <div className="text-sm font-semibold text-slate-700">状态</div>
                <label className="inline-flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={editing.enabled}
                    onChange={(e) => setEditing((cur) => cur && ({ ...cur, enabled: e.target.checked }))}
                    className="h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  模板可用（关闭后首页“示例模板”中不展示）
                </label>
              </div>
            </div>

            {/* 面板底部操作 */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
              <button
                type="button"
                onClick={cancelEdit}
                className="border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 图片放大预览 */}
      {zoomImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setZoomImage(null)}
              className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center bg-black/60 text-white hover:bg-black/80"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={zoomImage}
              alt="模板预览大图"
              className="max-h-[88vh] max-w-[90vw] border border-slate-600 bg-white object-contain shadow-2xl"
            />
          </div>
        </div>
      )}

      {/* Toast */}
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
