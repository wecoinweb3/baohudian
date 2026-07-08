import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, FileImage, ImagePlus, MousePointer2, Plus, Save, Square, Trash2, Type } from 'lucide-react';
import { api } from '../utils/api';
import type { CanvasData, DesignElement, DesignProject, ProjectPayload } from '../types';

const DEFAULT_WIDTH = 120;
const DEFAULT_HEIGHT = 70;
const DEFAULT_SAFE_WIDTH = 84;
const DEFAULT_SAFE_HEIGHT = 40;
const SCALE_OPTIONS = [0.3, 0.5, 0.7, 0.9, 1, 1.2, 1.5];
const SIDE_DIMENSION_WIDTH = 72;
const SIDE_DIMENSION_GAP = 24;
const SIDE_DIMENSION_LINE_X = 48;
const SIDE_DIMENSION_TICK_WIDTH = 28;
const CM_TO_CANVAS_SCALE = 10;

const normalizeLegacyDimension = (value: number) => (value > 300 ? value / CM_TO_CANVAS_SCALE : value);

const createDefaultProjectPayload = (): ProjectPayload => ({
  name: '未命名项目',
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  unit: 'cm',
  backgroundColor: '#ffffff',
  bleedlessWidth: DEFAULT_SAFE_WIDTH,
  bleedlessHeight: DEFAULT_SAFE_HEIGHT,
  canvasData: {
    canvas: {
      width: DEFAULT_WIDTH,
      height: DEFAULT_HEIGHT,
      unit: 'cm',
      backgroundColor: '#ffffff',
      safeArea: { width: DEFAULT_SAFE_WIDTH, height: DEFAULT_SAFE_HEIGHT },
    },
    elements: [],
  },
});

const serializeProjectPayload = (payload: ProjectPayload) => JSON.stringify({
  ...payload,
  canvasData: {
    ...payload.canvasData,
    elements: [...payload.canvasData.elements].sort((a, b) => a.zIndex - b.zIndex),
  },
});

const Workbench: React.FC = () => {
  const [projects, setProjects] = useState<DesignProject[]>([]);
  const [activeProject, setActiveProject] = useState<DesignProject | null>(null);
  const [projectName, setProjectName] = useState('未命名项目');
  const [canvasWidth, setCanvasWidth] = useState(DEFAULT_WIDTH);
  const [canvasHeight, setCanvasHeight] = useState(DEFAULT_HEIGHT);
  const [bleedlessWidth, setBleedlessWidth] = useState(DEFAULT_SAFE_WIDTH);
  const [bleedlessHeight, setBleedlessHeight] = useState(DEFAULT_SAFE_HEIGHT);
  const [backgroundColor, setBackgroundColor] = useState('#ffffff');
  const [elements, setElements] = useState<DesignElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scale, setScale] = useState(0.5);
  const [isSaving, setIsSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [dragState, setDragState] = useState<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; origin: DesignElement } | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState(() => serializeProjectPayload(createDefaultProjectPayload()));
  const [pendingAction, setPendingAction] = useState<{ type: 'open'; project: DesignProject } | { type: 'create' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const renderCanvasWidth = canvasWidth * CM_TO_CANVAS_SCALE;
  const renderCanvasHeight = canvasHeight * CM_TO_CANVAS_SCALE;
  const renderBleedlessWidth = bleedlessWidth * CM_TO_CANVAS_SCALE;
  const renderBleedlessHeight = bleedlessHeight * CM_TO_CANVAS_SCALE;
  const safeLeft = (renderCanvasWidth - renderBleedlessWidth) / 2;
  const safeTop = (renderCanvasHeight - renderBleedlessHeight) / 2;
  const previewCanvasWidth = renderCanvasWidth * scale;
  const previewCanvasHeight = renderCanvasHeight * scale;
  const topMeasureOffset = SIDE_DIMENSION_WIDTH + SIDE_DIMENSION_GAP;
  const previewTotalWidth = previewCanvasWidth + topMeasureOffset * 2;
  const sideDimensionTickLeft = SIDE_DIMENSION_LINE_X - SIDE_DIMENSION_TICK_WIDTH / 2;

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    void loadProjects(params.get('projectId') || undefined);
  }, []);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!dragState) return;
      const dx = (event.clientX - dragState.startX) / scale;
      const dy = (event.clientY - dragState.startY) / scale;
      setElements((items) =>
        items.map((item) => {
          if (item.id !== dragState.id) return item;
          if (dragState.mode === 'resize') {
            return { ...item, width: Math.max(30, dragState.origin.width + dx), height: Math.max(20, dragState.origin.height + dy) };
          }
          return {
            ...item,
            x: Math.max(0, Math.min(renderCanvasWidth - item.width, dragState.origin.x + dx)),
            y: Math.max(0, Math.min(renderCanvasHeight - item.height, dragState.origin.y + dy)),
          };
        }),
      );
    };

    const handleMouseUp = () => setDragState(null);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, renderCanvasHeight, renderCanvasWidth, scale]);

  const selectedElement = useMemo(() => elements.find((element) => element.id === selectedId) || null, [elements, selectedId]);

  const canvasData: CanvasData = useMemo(() => ({
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      unit: 'cm',
      backgroundColor,
      safeArea: { width: bleedlessWidth, height: bleedlessHeight },
    },
    elements: [...elements].sort((a, b) => a.zIndex - b.zIndex),
  }), [backgroundColor, bleedlessHeight, bleedlessWidth, canvasHeight, canvasWidth, elements]);

  const loadProjects = async (preferredProjectId?: string) => {
    const data = await api.projects.list();
    const nextProjects = data.projects || [];
    setProjects(nextProjects);

    if (nextProjects.length === 0) {
      if (activeProject) {
        resetEditor();
      }
      return;
    }

    const preferredProject = preferredProjectId
      ? nextProjects.find((project) => project.id === preferredProjectId)
      : null;

    if (preferredProject) {
      resetEditor(preferredProject);
      return;
    }

    const matchedActiveProject = activeProject
      ? nextProjects.find((project) => project.id === activeProject.id)
      : null;

    if (!matchedActiveProject) {
      resetEditor(nextProjects[0]);
    }
  };

  const resetEditor = (project?: DesignProject) => {
    if (!project) {
      const defaultPayload = createDefaultProjectPayload();
      setActiveProject(null);
      setProjectName(defaultPayload.name);
      setCanvasWidth(defaultPayload.width);
      setCanvasHeight(defaultPayload.height);
      setBleedlessWidth(defaultPayload.bleedlessWidth);
      setBleedlessHeight(defaultPayload.bleedlessHeight);
      setBackgroundColor(defaultPayload.backgroundColor);
      setElements([]);
      setSelectedId(null);
      setSavedSnapshot(serializeProjectPayload(defaultPayload));
      return;
    }

    const normalizedPayload: ProjectPayload = {
      name: project.name,
      width: normalizeLegacyDimension(project.width),
      height: normalizeLegacyDimension(project.height),
      unit: 'cm',
      backgroundColor: project.backgroundColor,
      bleedlessWidth: normalizeLegacyDimension(project.bleedlessWidth),
      bleedlessHeight: normalizeLegacyDimension(project.bleedlessHeight),
      canvasData: {
        canvas: {
          width: normalizeLegacyDimension(project.width),
          height: normalizeLegacyDimension(project.height),
          unit: 'cm',
          backgroundColor: project.backgroundColor,
          safeArea: {
            width: normalizeLegacyDimension(project.bleedlessWidth),
            height: normalizeLegacyDimension(project.bleedlessHeight),
          },
        },
        elements: project.canvasData?.elements || [],
      },
    };

    setActiveProject(project);
    setProjectName(normalizedPayload.name);
    setCanvasWidth(normalizedPayload.width);
    setCanvasHeight(normalizedPayload.height);
    setBleedlessWidth(normalizedPayload.bleedlessWidth);
    setBleedlessHeight(normalizedPayload.bleedlessHeight);
    setBackgroundColor(normalizedPayload.backgroundColor);
    setElements(normalizedPayload.canvasData.elements);
    setSelectedId(null);
    setSavedSnapshot(serializeProjectPayload(normalizedPayload));
  };

  const buildPayload = (): ProjectPayload => ({
    name: projectName,
    width: canvasWidth,
    height: canvasHeight,
    unit: 'cm',
    backgroundColor,
    bleedlessWidth,
    bleedlessHeight,
    canvasData,
  });

  const hasUnsavedChanges = () => serializeProjectPayload(buildPayload()) !== savedSnapshot;

  const saveProject = async () => {
    setIsSaving(true);
    try {
      const result = activeProject ? await api.projects.update(activeProject.id, buildPayload()) : await api.projects.create(buildPayload());
      if (result.success) {
        resetEditor(result.project);
        await loadProjects();
        setStatus(`已保存：${new Date().toLocaleTimeString()}`);
        return true;
      }
      setStatus(result.error || '保存失败');
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const openProject = (project: DesignProject) => {
    if (hasUnsavedChanges()) {
      setPendingAction({ type: 'open', project });
      return;
    }
    resetEditor(project);
  };

  const createProject = async () => {
    if (hasUnsavedChanges()) {
      setPendingAction({ type: 'create' });
      return;
    }

    await createBlankProject();
  };

  const createBlankProject = async () => {
    const defaultPayload = createDefaultProjectPayload();

    resetEditor();
    const result = await api.projects.create(defaultPayload);
    if (result.success) {
      resetEditor(result.project);
      await loadProjects();
      setStatus('新项目已创建');
    }
  };

  const continuePendingAction = async () => {
    if (!pendingAction) return;
    const action = pendingAction;
    setPendingAction(null);

    if (action.type === 'open') {
      resetEditor(action.project);
      return;
    }

    await createBlankProject();
  };

  const saveAndContinuePendingAction = async () => {
    const saved = await saveProject();
    if (!saved) return;
    await continuePendingAction();
  };

  const deleteProject = async (id: string) => {
    if (!window.confirm('确定删除这个项目吗？')) return;
    await api.projects.delete(id);
    if (activeProject?.id === id) resetEditor();
    await loadProjects();
  };

  const addText = () => {
    const id = `text_${Date.now()}`;
    setElements((items) => [...items, { id, type: 'text', x: 420, y: 230, width: 360, height: 70, text: '双击右侧编辑文字', fontFamily: 'Microsoft YaHei', fontSize: 46, fill: '#ef0000', fontWeight: '700', zIndex: items.length + 1 }]);
    setSelectedId(id);
  };

  const addRect = () => {
    const id = `rect_${Date.now()}`;
    setElements((items) => [...items, { id, type: 'rect', x: 360, y: 360, width: 480, height: 60, fill: '#ef0000', zIndex: items.length + 1 }]);
    setSelectedId(id);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = `image_${Date.now()}`;
      setElements((items) => [...items, { id, type: 'image', x: 160, y: 160, width: 180, height: 120, src: String(reader.result), zIndex: items.length + 1 }]);
      setSelectedId(id);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const updateSelected = (patch: Partial<DesignElement>) => {
    if (!selectedId) return;
    setElements((items) => items.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)));
  };

  const removeSelected = () => {
    if (!selectedId) return;
    setElements((items) => items.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  };

  const duplicateSelected = () => {
    if (!selectedElement) return;
    const nextId = `${selectedElement.type}_${Date.now()}`;
    const duplicatedElement: DesignElement = {
      ...selectedElement,
      id: nextId,
      x: Math.min(renderCanvasWidth - selectedElement.width, selectedElement.x + 30),
      y: Math.min(renderCanvasHeight - selectedElement.height, selectedElement.y + 30),
      zIndex: elements.length + 1,
    };
    setElements((items) => [...items, duplicatedElement]);
    setSelectedId(nextId);
    setStatus('已复制一个元素');
  };

  const startDrag = (event: React.MouseEvent, item: DesignElement, mode: 'move' | 'resize') => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(item.id);
    setDragState({ id: item.id, mode, startX: event.clientX, startY: event.clientY, origin: item });
  };

  const exportImage = async () => {
    const exportPadding = 180;
    const canvas = document.createElement('canvas');
    canvas.width = renderCanvasWidth + exportPadding * 2;
    canvas.height = renderCanvasHeight + exportPadding * 2;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const originX = exportPadding;
    const originY = exportPadding;
    const safeX = originX + safeLeft;
    const safeY = originY + safeTop;

    const drawDimensionLine = (
      startX: number,
      startY: number,
      endX: number,
      endY: number,
      label: string,
      direction: 'horizontal' | 'vertical',
    ) => {
      ctx.save();
      ctx.strokeStyle = '#111111';
      ctx.fillStyle = '#111111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.lineTo(endX, endY);
      ctx.stroke();

      if (direction === 'horizontal') {
        ctx.beginPath();
        ctx.moveTo(startX, startY - 16);
        ctx.lineTo(startX, startY + 16);
        ctx.moveTo(endX, endY - 16);
        ctx.lineTo(endX, endY + 16);
        ctx.stroke();
        ctx.font = 'bold 30px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, (startX + endX) / 2, startY - 12);
      } else {
        ctx.beginPath();
        ctx.moveTo(startX - 16, startY);
        ctx.lineTo(startX + 16, startY);
        ctx.moveTo(endX - 16, endY);
        ctx.lineTo(endX + 16, endY);
        ctx.stroke();
        ctx.translate(startX - 26, (startY + endY) / 2);
        ctx.rotate(-Math.PI / 2);
        ctx.font = 'bold 30px Microsoft YaHei';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, 0, 0);
      }
      ctx.restore();
    };

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(originX, originY, renderCanvasWidth, renderCanvasHeight);
    ctx.strokeStyle = '#666666';
    ctx.lineWidth = 2;
    ctx.strokeRect(originX, originY, renderCanvasWidth, renderCanvasHeight);

    drawDimensionLine(originX, originY - 70, originX + renderCanvasWidth, originY - 70, `${canvasWidth}CM`, 'horizontal');
    drawDimensionLine(originX + renderCanvasWidth + 70, originY, originX + renderCanvasWidth + 70, originY + renderCanvasHeight, `${canvasHeight}CM`, 'vertical');
    drawDimensionLine(safeX, originY - 18, safeX + renderBleedlessWidth, originY - 18, `${bleedlessWidth}CM`, 'horizontal');
    drawDimensionLine(originX - 22, safeY, originX - 22, safeY + renderBleedlessHeight, `${bleedlessHeight}CM`, 'vertical');

    for (const item of [...elements].sort((a, b) => a.zIndex - b.zIndex)) {
      ctx.globalAlpha = item.opacity ?? 1;
      if (item.type === 'rect') {
        ctx.fillStyle = item.fill || '#ef0000';
        ctx.fillRect(originX + item.x, originY + item.y, item.width, item.height);
      }
      if (item.type === 'text') {
        ctx.fillStyle = item.fill || '#111827';
        ctx.font = `${item.fontWeight || '400'} ${item.fontSize || 32}px ${item.fontFamily || 'Arial'}`;
        ctx.textBaseline = 'top';
        ctx.fillText(item.text || '', originX + item.x, originY + item.y, item.width);
      }
      if (item.type === 'image' && item.src) {
        await new Promise<void>((resolve) => {
          const image = new Image();
          image.onload = () => {
            ctx.drawImage(image, originX + item.x, originY + item.y, item.width, item.height);
            resolve();
          };
          image.onerror = () => resolve();
          image.src = item.src || '';
        });
      }
    }

    ctx.globalAlpha = 1;
    const link = document.createElement('a');
    link.download = `${projectName || 'design'}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="h-full flex flex-col overflow-auto bg-slate-100 text-slate-800 lg:flex-row lg:overflow-hidden">
      {pendingAction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="border-b border-slate-100 px-6 py-5">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                  <Save className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">当前项目有未保存修改</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-500">
                    {pendingAction.type === 'open' ? '切换到其他项目之前，建议先保存当前编辑内容。' : '新建项目之前，建议先保存当前编辑内容。'}
                  </p>
                </div>
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 bg-slate-50 px-6 py-4 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setPendingAction(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                取消
              </button>
              <button
                type="button"
                onClick={continuePendingAction}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                不保存继续
              </button>
              <button
                type="button"
                onClick={saveAndContinuePendingAction}
                disabled={isSaving}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving ? '保存中...' : '保存并继续'}
              </button>
            </div>
          </div>
        </div>
      )}
      <aside className={`${sidebarCollapsed ? 'lg:w-20' : 'lg:w-80'} flex max-h-72 w-full flex-col border-b border-slate-200 bg-white transition-all duration-200 lg:max-h-none lg:border-b-0 lg:border-r`}>
        <div className={`border-b border-slate-100 ${sidebarCollapsed ? 'p-3' : 'p-4'}`}>
          <div className={`flex ${sidebarCollapsed ? 'gap-3 items-center lg:flex-col' : 'items-center gap-2'}`}>
            <button
              onClick={() => setSidebarCollapsed((value) => !value)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              title={sidebarCollapsed ? '展开项目边栏' : '收起项目边栏'}
            >
              {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
            <button onClick={createProject} className={`${sidebarCollapsed ? 'h-11 w-11' : 'flex-1 px-4 py-3'} inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700`} title="新建项目">
              <Plus className="w-4 h-4" />
              {!sidebarCollapsed && '新建项目'}
            </button>
          </div>
        </div>
        <div className={`flex-1 overflow-auto ${sidebarCollapsed ? 'p-2' : 'p-4'} space-y-3`}>
          {!sidebarCollapsed && <h2 className="font-semibold text-slate-700">历史项目</h2>}
          {projects.length === 0 && !sidebarCollapsed && <div className="text-sm text-slate-400">暂无项目，点击上方新建。</div>}
          {projects.map((project) => (
            sidebarCollapsed ? (
              <button
                key={project.id}
                onClick={() => openProject(project)}
                title={project.name}
                className={`flex h-12 w-full items-center justify-center rounded-xl border transition ${activeProject?.id === project.id ? 'border-blue-500 bg-blue-50 text-blue-600' : 'border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600'}`}
              >
                <span className="text-base font-semibold">{project.name.trim().charAt(0) || '项'}</span>
              </button>
            ) : (
              <div key={project.id} className={`rounded-xl border p-3 cursor-pointer transition ${activeProject?.id === project.id ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-blue-300'}`} onClick={() => openProject(project)}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium text-slate-800">{project.name}</div>
                    <div className="mt-1 text-xs text-slate-500">{project.width} × {project.height} · {new Date(project.updatedAt).toLocaleString()}</div>
                  </div>
                  <button onClick={(event) => { event.stopPropagation(); deleteProject(project.id); }} className="text-slate-400 hover:text-red-500">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      </aside>

      <section className="flex-none min-w-0 flex flex-col overflow-visible lg:flex-1 lg:overflow-hidden">
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex flex-col gap-3 lg:h-16 lg:flex-row lg:items-center lg:justify-between lg:py-0">
          <div className="flex min-w-0 items-center gap-3">
            <FileImage className="w-5 h-5 text-blue-600" />
            <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 lg:w-64 lg:flex-none" />
            <span className="text-xs text-slate-400">{status}</span>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 lg:overflow-visible lg:pb-0">
            <button className="toolbar-btn" onClick={() => setScale((v) => Math.max(0.3, Number((v - 0.1).toFixed(2))))}>缩小</button>
            <select
              value={String(scale)}
              onChange={(e) => setScale(Number(e.target.value))}
              className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SCALE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {Math.round(option * 100)}%
                </option>
              ))}
            </select>
            <button className="toolbar-btn" onClick={() => setScale((v) => Math.min(1.5, Number((v + 0.1).toFixed(2))))}>放大</button>
            <button onClick={saveProject} className="primary-btn" disabled={isSaving}><Save className="w-4 h-4" /> {isSaving ? '保存中' : '保存'}</button>
            <button onClick={exportImage} className="primary-btn bg-emerald-600 hover:bg-emerald-700"><Download className="w-4 h-4" /> 导出 PNG</button>
          </div>
        </header>

        <div className="flex-none min-h-0 flex flex-col lg:flex-1 lg:flex-row">
          <div className="flex w-full items-center gap-3 overflow-x-auto border-b border-slate-200 bg-white px-4 py-3 lg:w-16 lg:flex-col lg:border-b-0 lg:border-r lg:px-0 lg:py-4">
            <button title="选择" className="tool-btn"><MousePointer2 className="w-5 h-5" /></button>
            <button title="文字" className="tool-btn" onClick={addText}><Type className="w-5 h-5" /></button>
            <button title="图片" className="tool-btn" onClick={() => fileInputRef.current?.click()}><ImagePlus className="w-5 h-5" /></button>
            <button title="色块" className="tool-btn" onClick={addRect}><Square className="w-5 h-5" /></button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
          </div>

          <main className="flex-none min-h-[560px] flex flex-col bg-slate-100 lg:flex-1 lg:min-h-0">
            <div className="shrink-0 border-b border-slate-200 bg-slate-100 px-4 py-3 lg:px-8">
              <div className="mx-auto w-fit">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                  <InlineField label="画布宽 CM" value={canvasWidth} onChange={setCanvasWidth} />
                  <InlineField label="画布高 CM" value={canvasHeight} onChange={setCanvasHeight} />
                  <InlineField label="非留白宽 CM" value={bleedlessWidth} onChange={setBleedlessWidth} />
                  <InlineField label="非留白高 CM" value={bleedlessHeight} onChange={setBleedlessHeight} />
                  <label className="flex items-center gap-3 text-sm text-slate-600">
                    <span className="shrink-0 whitespace-nowrap">画布颜色</span>
                    <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} className="h-10 w-full min-w-0 rounded-lg border border-slate-200 bg-white p-1" />
                  </label>
                </div>
              </div>
            </div>

            <div className="min-h-[360px] flex-1 overflow-auto p-4 lg:min-h-0 lg:p-8">
              <div className="mx-auto w-fit space-y-6">
                <div>
                  <div className="relative mb-6" style={{ width: previewTotalWidth, height: 62 }}>
                    <div className="absolute top-3 h-px bg-slate-700" style={{ left: topMeasureOffset, width: previewCanvasWidth }} />
                    <div className="absolute top-0 w-px bg-slate-700" style={{ left: topMeasureOffset, height: 26 }} />
                    <div className="absolute top-0 w-px bg-slate-700" style={{ left: topMeasureOffset + previewCanvasWidth, height: 26 }} />
                    <div className="absolute top-0 -translate-x-1/2 whitespace-nowrap bg-slate-100 px-2 text-sm font-bold text-slate-700" style={{ left: topMeasureOffset + previewCanvasWidth / 2 }}>总宽 {canvasWidth}CM</div>

                    <div className="absolute top-11 h-px bg-slate-500" style={{ left: topMeasureOffset + safeLeft * scale, width: renderBleedlessWidth * scale }} />
                    <div className="absolute top-8 w-px bg-slate-500" style={{ left: topMeasureOffset + safeLeft * scale, height: 20 }} />
                    <div className="absolute top-8 w-px bg-slate-500" style={{ left: topMeasureOffset + (safeLeft + renderBleedlessWidth) * scale, height: 20 }} />
                    <div className="absolute top-10 -translate-x-1/2 whitespace-nowrap bg-slate-100 px-2 text-sm font-bold text-slate-700" style={{ left: topMeasureOffset + (safeLeft + renderBleedlessWidth / 2) * scale }}>{bleedlessWidth}CM</div>
                  </div>
                  <div className="flex">
                    <div className="relative mr-6" style={{ width: SIDE_DIMENSION_WIDTH, height: previewCanvasHeight }}>
                      <div className="absolute w-px bg-slate-700" style={{ left: SIDE_DIMENSION_LINE_X, top: safeTop * scale, height: renderBleedlessHeight * scale }} />
                      <div className="absolute h-px bg-slate-700" style={{ left: sideDimensionTickLeft, top: safeTop * scale, width: SIDE_DIMENSION_TICK_WIDTH }} />
                      <div className="absolute h-px bg-slate-700" style={{ left: sideDimensionTickLeft, top: (safeTop + renderBleedlessHeight) * scale, width: SIDE_DIMENSION_TICK_WIDTH }} />
                      <div className="absolute -translate-y-1/2 -rotate-90 whitespace-nowrap bg-slate-100 px-1 text-sm font-bold text-slate-700" style={{ left: 0, top: (safeTop + renderBleedlessHeight / 2) * scale }}>{bleedlessHeight}CM</div>
                    </div>
                    <div className="relative shadow-2xl ring-1 ring-slate-300" style={{ width: previewCanvasWidth, height: previewCanvasHeight, backgroundColor }} onMouseDown={() => setSelectedId(null)}>
                      <div className="absolute border-2 border-dashed border-blue-400/70 pointer-events-none" style={{ left: safeLeft * scale, top: safeTop * scale, width: renderBleedlessWidth * scale, height: renderBleedlessHeight * scale }} />
                      <div className="absolute left-1/2 top-0 bottom-0 border-l border-cyan-400/40 pointer-events-none" />
                      <div className="absolute top-1/2 left-0 right-0 border-t border-cyan-400/40 pointer-events-none" />
                      {[...elements].sort((a, b) => a.zIndex - b.zIndex).map((item) => (
                        <div key={item.id} className={`absolute select-none ${selectedId === item.id ? 'ring-2 ring-blue-500' : ''}`} style={{ left: item.x * scale, top: item.y * scale, width: item.width * scale, height: item.height * scale }} onMouseDown={(event) => startDrag(event, item, 'move')}>
                          {item.type === 'text' && <div className="w-full h-full overflow-hidden whitespace-pre-wrap" style={{ color: item.fill, fontFamily: item.fontFamily, fontSize: (item.fontSize || 32) * scale, fontWeight: item.fontWeight }}>{item.text}</div>}
                          {item.type === 'rect' && <div className="w-full h-full" style={{ backgroundColor: item.fill, opacity: item.opacity ?? 1 }} />}
                          {item.type === 'image' && <img src={item.src} className="w-full h-full object-fill pointer-events-none" />}
                          {selectedId === item.id && <span className="absolute -right-2 -bottom-2 h-4 w-4 cursor-se-resize rounded-full border-2 border-white bg-blue-600" onMouseDown={(event) => startDrag(event, item, 'resize')} />}
                        </div>
                      ))}
                    </div>
                    <div className="relative ml-6" style={{ width: SIDE_DIMENSION_WIDTH, height: previewCanvasHeight }}>
                      <div className="absolute top-0 w-px bg-slate-700" style={{ left: SIDE_DIMENSION_LINE_X, height: previewCanvasHeight }} />
                      <div className="absolute top-0 h-px bg-slate-700" style={{ left: sideDimensionTickLeft, width: SIDE_DIMENSION_TICK_WIDTH }} />
                      <div className="absolute h-px bg-slate-700" style={{ left: sideDimensionTickLeft, top: previewCanvasHeight, width: SIDE_DIMENSION_TICK_WIDTH }} />
                      <div className="absolute top-1/2 -translate-y-1/2 rotate-90 whitespace-nowrap bg-slate-100 px-1 text-sm font-bold text-slate-700" style={{ left: SIDE_DIMENSION_LINE_X + 10 }}>{canvasHeight}CM</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </main>

          <aside className="max-h-80 w-full overflow-auto border-t border-slate-200 bg-white p-4 space-y-5 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
            <Panel title="元素属性">
              {!selectedElement && <div className="text-sm text-slate-400">请选择画布上的文字、图片或色块。</div>}
              {selectedElement && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="X" value={Math.round(selectedElement.x)} onChange={(v) => updateSelected({ x: v })} />
                    <Field label="Y" value={Math.round(selectedElement.y)} onChange={(v) => updateSelected({ y: v })} />
                    <Field label="宽" value={Math.round(selectedElement.width)} onChange={(v) => updateSelected({ width: v })} />
                    <Field label="高" value={Math.round(selectedElement.height)} onChange={(v) => updateSelected({ height: v })} />
                  </div>
                  {selectedElement.type === 'text' && (
                    <>
                      <label className="text-sm text-slate-600">文字内容</label>
                      <textarea value={selectedElement.text || ''} onChange={(e) => updateSelected({ text: e.target.value })} className="input min-h-20" />
                      <Field label="字号" value={selectedElement.fontSize || 32} onChange={(v) => updateSelected({ fontSize: v })} />
                      <label className="text-sm text-slate-600">字体</label>
                      <select value={selectedElement.fontFamily || 'Microsoft YaHei'} onChange={(e) => updateSelected({ fontFamily: e.target.value })} className="input">
                        <option>Microsoft YaHei</option>
                        <option>SimHei</option>
                        <option>Arial</option>
                        <option>serif</option>
                      </select>
                    </>
                  )}
                  {(selectedElement.type === 'text' || selectedElement.type === 'rect') && (
                    <>
                      <label className="text-sm text-slate-600">颜色</label>
                      <input type="color" value={selectedElement.fill || '#ef0000'} onChange={(e) => updateSelected({ fill: e.target.value })} className="h-10 w-full" />
                    </>
                  )}
                  <button onClick={duplicateSelected} className="w-full rounded-lg border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50">复制元素</button>
                  <button onClick={removeSelected} className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">删除元素</button>
                </>
              )}
            </Panel>
          </aside>
        </div>
      </section>
    </div>
  );
};

const Panel: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="space-y-3 rounded-xl border border-slate-200 p-4">
    <h3 className="font-semibold text-slate-800">{title}</h3>
    {children}
  </div>
);

const normalizeNumericInput = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return String(Number(digits));
};

const Field: React.FC<{ label: string; value: number; onChange: (value: number) => void }> = ({ label, value, onChange }) => (
  <label className="block space-y-1 text-sm text-slate-600">
    <span>{label}</span>
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={String(value)}
      onChange={(e) => {
        const normalized = normalizeNumericInput(e.target.value);
        onChange(normalized ? Number(normalized) : 0);
      }}
      className="input"
    />
  </label>
);

const InlineField: React.FC<{ label: string; value: number; onChange: (value: number) => void }> = ({ label, value, onChange }) => (
  <label className="flex items-center gap-3 text-sm text-slate-600">
    <span className="shrink-0 whitespace-nowrap">{label}</span>
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={String(value)}
      onChange={(e) => {
        const normalized = normalizeNumericInput(e.target.value);
        onChange(normalized ? Number(normalized) : 0);
      }}
      className="input min-w-0"
    />
  </label>
);

export default Workbench;