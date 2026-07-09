import type { MaterialItem, PromptItem, GenerateRequest, GenerateResponse, DesignProject, ProjectPayload, AISettings, AuthUser, ConversationItem, ConversationMessage } from '../types';
import type { ConversationDesignDraft } from '../lib/chatDesign';

const BASE_URL = '/api';

export const api = {
  auth: {
    login: async (data: { username: string; password: string }): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
      const response = await fetch(`${BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    logout: async (): Promise<{ success: boolean }> => {
      const response = await fetch(`${BASE_URL}/auth/logout`, { method: 'POST' });
      return response.json();
    },
  },
  materials: {
    get: async (): Promise<{ patterns: MaterialItem[]; spaces: MaterialItem[] }> => {
      const response = await fetch(`${BASE_URL}/materials`);
      return response.json();
    },
    upload: async (file: File, type: 'pattern' | 'space', name: string): Promise<MaterialItem> => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      formData.append('name', name);
      const response = await fetch(`${BASE_URL}/materials/upload`, {
        method: 'POST',
        body: formData,
      });
      return response.json();
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const response = await fetch(`${BASE_URL}/materials/${id}`, {
        method: 'DELETE',
      });
      return response.json();
    },
  },
  prompts: {
    get: async (): Promise<{ prompts: PromptItem[] }> => {
      const response = await fetch(`${BASE_URL}/prompts`);
      return response.json();
    },
    save: async (prompt: Partial<PromptItem>): Promise<{ success: boolean }> => {
      const response = await fetch(`${BASE_URL}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(prompt),
      });
      return response.json();
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const response = await fetch(`${BASE_URL}/prompts/${id}`, {
        method: 'DELETE',
      });
      return response.json();
    },
  },
  generate: {
    image: async (data: GenerateRequest): Promise<GenerateResponse> => {
      const response = await fetch(`${BASE_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    canvas: async (data: { prompt: string; messages?: Array<{ role: string; content: string }>; images?: Array<{ id: string; name: string; src: string }>; referenceImages?: Array<{ id: string; name: string; src: string }> }): Promise<{ success: boolean; draft?: ConversationDesignDraft; reply?: string; error?: string }> => {
      const response = await fetch(`${BASE_URL}/generate/canvas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    normalizeLogo: async (data: { image: string; fileName: string; targetColor?: string }): Promise<{ success: boolean; imageUrl?: string; fileName?: string; info?: { targetColor: string; steps: string[] }; error?: string }> => {
      const response = await fetch(`${BASE_URL}/generate/logo-normalize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    tweakLayout: async (data: { prompt: string; draft: ConversationDesignDraft }): Promise<{ success: boolean; patches?: Array<{ targetRole: string; action: string; dx?: number; dy?: number; dw?: number; dh?: number; color?: string; backgroundColor?: string; fontSize?: number; fontWeight?: string; textAlign?: 'left' | 'center' | 'right'; letterSpacing?: number }>; reply?: string; error?: string }> => {
      const response = await fetch(`${BASE_URL}/generate/tweak-layout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    clarifyReferenceIntent: async (data: { prompt: string; messages?: Array<{ role: string; content: string }>; referenceImages: Array<{ id: string; name: string; src: string }> }): Promise<{ success: boolean; question?: string; suggestions?: string[]; exampleInput?: string; error?: string }> => {
      const response = await fetch(`${BASE_URL}/generate/clarify-reference-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    prepareFromReference: async (data: { prompt: string; messages?: Array<{ role: string; content: string }>; referenceImages: Array<{ id: string; name: string; src: string }> }): Promise<{ success: boolean; summary?: string; preparedPrompt?: string; extractedTexts?: string[]; error?: string }> => {
      const response = await fetch(`${BASE_URL}/generate/prepare-from-reference`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
  },
  projects: {
    list: async (): Promise<{ projects: DesignProject[] }> => {
      const response = await fetch(`${BASE_URL}/projects`);
      return response.json();
    },
    get: async (id: string): Promise<{ project: DesignProject }> => {
      const response = await fetch(`${BASE_URL}/projects/${id}`);
      return response.json();
    },
    create: async (data: ProjectPayload): Promise<{ success: boolean; project: DesignProject; error?: string }> => {
      const response = await fetch(`${BASE_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    update: async (id: string, data: ProjectPayload): Promise<{ success: boolean; project: DesignProject; error?: string }> => {
      const response = await fetch(`${BASE_URL}/projects/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    delete: async (id: string): Promise<{ success: boolean }> => {
      const response = await fetch(`${BASE_URL}/projects/${id}`, { method: 'DELETE' });
      return response.json();
    },
  },
  settings: {
    get: async (): Promise<{ success: boolean; settings: AISettings; error?: string }> => {
      const response = await fetch(`${BASE_URL}/settings`);
      return response.json();
    },
    save: async (data: AISettings): Promise<{ success: boolean; settings: AISettings; error?: string }> => {
      const response = await fetch(`${BASE_URL}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
  },
  presetPrompts: {
    list: async (options?: { enabledOnly?: boolean }): Promise<{ success: boolean; presets: Array<{ id: string; title: string; prompt: string; thumbnailUrl: string; sortOrder: number; enabled: boolean }>; error?: string }> => {
      const query = options?.enabledOnly ? '?enabledOnly=true' : '';
      const response = await fetch(`${BASE_URL}/preset-prompts${query}`);
      return response.json();
    },
    get: async (id: string): Promise<{ success: boolean; preset?: { id: string; title: string; prompt: string; thumbnailUrl: string; sortOrder: number; enabled: boolean }; error?: string }> => {
      const response = await fetch(`${BASE_URL}/preset-prompts/${id}`);
      return response.json();
    },
    save: async (data: { id?: string; title: string; prompt: string; thumbnailUrl?: string; sortOrder?: number; enabled?: boolean }): Promise<{ success: boolean; error?: string }> => {
      const response = await fetch(`${BASE_URL}/preset-prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
      const response = await fetch(`${BASE_URL}/preset-prompts/${id}`, { method: 'DELETE' });
      return response.json();
    },
  },
  conversations: {
    list: async (): Promise<{ conversations: ConversationItem[] }> => {
      const response = await fetch(`${BASE_URL}/conversations`);
      return response.json();
    },
    get: async (id: string): Promise<{ conversation: ConversationItem }> => {
      const response = await fetch(`${BASE_URL}/conversations/${id}`);
      return response.json();
    },
    create: async (data: { title: string; messages: ConversationMessage[] }): Promise<{ success: boolean; conversation: ConversationItem; error?: string }> => {
      const response = await fetch(`${BASE_URL}/conversations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    update: async (id: string, data: { title: string; messages: ConversationMessage[] }): Promise<{ success: boolean; conversation: ConversationItem; error?: string }> => {
      const response = await fetch(`${BASE_URL}/conversations/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return response.json();
    },
    delete: async (id: string): Promise<{ success: boolean; error?: string }> => {
      const response = await fetch(`${BASE_URL}/conversations/${id}`, { method: 'DELETE' });
      return response.json();
    },
  },
};