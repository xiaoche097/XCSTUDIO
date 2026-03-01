export type ProviderStage =
  | 'config'
  | 'modelResolve'
  | 'modelList'
  | 'generateRequest'
  | 'polling'
  | 'responseParse'
  | 'unknown';

export interface ProviderErrorShape {
  provider: string;
  code: string;
  status?: number;
  retryable: boolean;
  stage: ProviderStage;
  details?: string;
}

export class ProviderError extends Error implements ProviderErrorShape {
  provider: string;
  code: string;
  status?: number;
  retryable: boolean;
  stage: ProviderStage;
  details?: string;

  constructor(params: ProviderErrorShape & { message: string }) {
    super(params.message);
    this.name = 'ProviderError';
    this.provider = params.provider;
    this.code = params.code;
    this.status = params.status;
    this.retryable = params.retryable;
    this.stage = params.stage;
    this.details = params.details;
  }
}

export const isProviderError = (error: unknown): error is ProviderError => {
  return error instanceof ProviderError;
};
