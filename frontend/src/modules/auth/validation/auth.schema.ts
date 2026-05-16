import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalido'),
  password: z.string().min(1, 'Password requerido'),
});

export const setPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Minimo 8 caracteres')
      .max(72)
      .regex(/[A-Z]/, 'Debe incluir una mayuscula')
      .regex(/[a-z]/, 'Debe incluir una minuscula')
      .regex(/[0-9]/, 'Debe incluir un numero'),
    confirm: z.string().min(1, 'Confirma la password'),
  })
  .refine((data) => data.password === data.confirm, {
    message: 'Las passwords no coinciden',
    path: ['confirm'],
  });

export type LoginInput = z.infer<typeof loginSchema>;
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;
