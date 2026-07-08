import type { MaterialItem, PromptItem, GenerateRequest, GenerateResponse, DesignProject, ProjectPayload } from '../types';

const BASE_URL = '/api';

export const api = {
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
};