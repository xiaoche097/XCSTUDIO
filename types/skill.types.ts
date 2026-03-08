import { ImageModel, VideoModel } from './common';

export interface ImageGenSkillParams {
  prompt: string;
  model: ImageModel;
  aspectRatio: string;
  imageSize?: '1K' | '2K' | '4K';
  referenceImage?: string;
  referenceImageUrl?: string;
  reference_image_url?: string;
  initImage?: string;
  init_image?: string;
  referenceImages?: string[];
  referenceStrength?: number;
  referencePriority?: 'first' | 'all';
  referenceMode?: 'style' | 'product';
  brandContext?: {
    colors?: string[];
    style?: string;
  };
  consistencyContext?: {
    approvedAssetIds?: string[];
    subjectAnchors?: string[];
    referenceSummary?: string;
    forbiddenChanges?: string[];
  };
}

export interface VideoGenSkillParams {
  prompt: string;
  model: VideoModel;
  aspectRatio: string;
  startFrame?: string;
  endFrame?: string;
  referenceImages?: string[];
}

export interface TextExtractSkillParams {
  imageData: string;
}

export interface RegionAnalyzeSkillParams {
  imageData: string;
  regionPrompt: string;
}

export interface TouchEditSkillParams {
  imageData: string;
  regionX: number;
  regionY: number;
  regionWidth: number;
  regionHeight: number;
  editInstruction: string;
  aspectRatio?: string;
  preservePrompt?: string;
}
