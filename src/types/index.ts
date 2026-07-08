export interface MaterialItem {
  id: string;
  name: string;
  url: string;
  type: 'pattern' | 'space';
  createdAt: string;
}

export interface PromptItem {
  id: string;
  name: string;
  content: string;
  category: string;
  createdAt: string;
}

export interface TemplateItem {
  id: string;
  name: string;
  patternId: string;
  spaceId: string;
  promptId: string;
  createdAt: string;
}

export interface GenerateRequest {
  templateId?: string;
  prompt: string;
  patternImage?: string;
  spaceImage?: string;
  aspectRatio?: '1:1' | '16:9' | '9:16';
}

export interface GenerateResponse {
  success: boolean;
  imageUrl?: string;
  error?: string;
}

export type DesignElementType = 'text' | 'image' | 'rect';

export interface DesignElement {
  id: string;
  type: DesignElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  zIndex: number;
  text?: string;
  fontFamily?: string;
  fontSize?: number;
  fill?: string;
  fontWeight?: string;
  src?: string;
  opacity?: number;
}

export interface CanvasData {
  canvas: {
    width: number;
    height: number;
    unit: string;
    backgroundColor: string;
    safeArea: {
      width: number;
      height: number;
    };
  };
  elements: DesignElement[];
}

export interface DesignProject {
  id: string;
  name: string;
  thumbnail?: string;
  width: number;
  height: number;
  unit: string;
  backgroundColor: string;
  bleedlessWidth: number;
  bleedlessHeight: number;
  canvasData: CanvasData;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectPayload {
  name: string;
  width: number;
  height: number;
  unit: string;
  backgroundColor: string;
  bleedlessWidth: number;
  bleedlessHeight: number;
  canvasData?: CanvasData;
  thumbnail?: string;
}