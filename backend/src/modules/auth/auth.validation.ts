// Schemas Zod del modulo auth.

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalido').toLowerCase(),
  password: z.string().min(1, 'Password requerido'),
});

export const setPasswordSchema = z.object({
  token: z.string().min(20, 'Token invalido'),
  password: z
    .string()
    .min(8, 'Minimo 8 caracteres')
    .max(72, 'Maximo 72 caracteres')
    .regex(/[A-Z]/, 'Debe incluir una mayuscula')
    .regex(/[a-z]/, 'Debe incluir una minuscula')
    .regex(/[0-9]/, 'Debe incluir un numero'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email().toLowerCase(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Password actual requerido'),
  newPassword: z
    .string()
    .min(8)
    .max(72)
    .regex(/[A-Z]/, 'Debe incluir una mayuscula')
    .regex(/[a-z]/, 'Debe incluir una minuscula')
    .regex(/[0-9]/, 'Debe incluir un numero'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
