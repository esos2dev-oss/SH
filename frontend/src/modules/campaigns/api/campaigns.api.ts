import { api } from '../../../shared/api/client';

export type EmailEvent = 'bienvenida' | 'post_estancia' | 'fecha_especial' | 'recuperacion' | 'manual';
export type CampaignStatus = 'borrador' | 'programada' | 'enviando' | 'enviada' | 'cancelada';

export interface EmailTemplate {
  id: number;
  nombre: string;
  event: EmailEvent;
  asunto: string;
  body_html: string;
  body_text: string | null;
  variables: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Campaign {
  id: number;
  nombre: string;
  template_id: number;
  event: EmailEvent;
  segmento: { type?: string };
  programada_para: string | null;
  status: CampaignStatus;
  total_destinatarios: number;
  total_enviados: number;
  total_aperturas: number;
  total_rebotes: number;
  created_by: number;
  created_at: string;
  sent_at: string | null;
}

export interface CampaignLog {
  id: number;
  customer_id: number | null;
  email: string;
  asunto: string;
  status: string;
  provider_id: string | null;
  sent_at: string | null;
  opened_at: string | null;
  error_msg: string | null;
  created_at: string;
}

// Templates
export const listTemplates = (params?: { event?: EmailEvent }) =>
  api.get<EmailTemplate[]>('/api/email-templates', { query: params as Record<string, string | number | boolean | undefined> | undefined });
export const getTemplate = (id: number) => api.get<EmailTemplate>(`/api/email-templates/${id}`);
export const createTemplate = (data: Partial<EmailTemplate> & { nombre: string; event: EmailEvent; asunto: string; body_html: string }) =>
  api.post<EmailTemplate>('/api/email-templates', data);
export const updateTemplate = (id: number, data: Partial<EmailTemplate>) => api.patch<EmailTemplate>(`/api/email-templates/${id}`, data);
export const deleteTemplate = (id: number) => api.delete(`/api/email-templates/${id}`);
export const previewTemplate = (id: number, sample?: Record<string, unknown>) =>
  api.post<{ asunto: string; html: string; text: string | null }>(`/api/email-templates/${id}/preview`, sample ?? {});

// Campaigns
export const listCampaigns = (params?: { status?: CampaignStatus; event?: EmailEvent }) =>
  api.get<Campaign[]>('/api/email-campaigns', { query: params as Record<string, string | number | boolean | undefined> | undefined });
export const getCampaign = (id: number) => api.get<Campaign>(`/api/email-campaigns/${id}`);
export const getCampaignLogs = (id: number) => api.get<CampaignLog[]>(`/api/email-campaigns/${id}/logs`);
export const createCampaign = (data: { nombre: string; template_id: number; event?: EmailEvent; segmento?: Record<string, unknown>; programada_para?: string | null }) =>
  api.post<Campaign>('/api/email-campaigns', data);
export const cancelCampaign = (id: number) => api.post(`/api/email-campaigns/${id}/cancel`);
export const sendCampaignNow = (id: number) =>
  api.post<{ campaign_id: number; total: number; enviados: number; fallidos: number }>(`/api/email-campaigns/${id}/send-now`);
