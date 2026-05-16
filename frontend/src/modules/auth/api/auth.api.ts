import { api } from '../../../shared/api/client';

export async function setPassword(token: string, password: string): Promise<{ message: string }> {
  return api.post('/api/auth/set-password', { token, password }, { skipRefresh: true });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<{ message: string }> {
  return api.post('/api/auth/change-password', { currentPassword, newPassword });
}

export async function forgotPassword(email: string): Promise<{ message: string }> {
  return api.post('/api/auth/forgot-password', { email }, { skipRefresh: true });
}
