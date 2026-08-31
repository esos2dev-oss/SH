// Hoteles del usuario: listado, alta y cambio de hotel activo.

import { supabase, invokeFunction } from '../../../shared/lib/supabase';
import { ApiError } from '../../../shared/api/client';
import type { PlanCode, SubscriptionStatus, AccessLevel } from './billing.api';

export type HotelRole = 'owner' | 'admin' | 'recepcion' | 'limpieza' | 'contabilidad' | 'restaurante';

export interface HotelMembership {
  hotel_id: number;
  nombre: string;
  slug: string;
  role: HotelRole;
  plan: PlanCode;
  status: SubscriptionStatus;
  access: AccessLevel;
}

/** Hoteles a los que pertenece el usuario. Uno solo en el caso habitual. */
export async function listMyHotels(): Promise<HotelMembership[]> {
  const { data, error } = await supabase.rpc('my_hotels');
  if (error) throw new ApiError(400, error.message, 'HOTELS_READ_ERROR');
  return (data ?? []) as HotelMembership[];
}

/**
 * Cambia el hotel activo.
 *
 * El hotel activo viaja en el token (app_metadata), no en la conexion: PostgREST
 * usa un pool y lo fijado en una peticion no existe en la siguiente. Por eso hay
 * que refrescar la sesion antes de que el cambio surta efecto — si no, la
 * siguiente consulta seguiria devolviendo datos del hotel anterior.
 */
export async function switchHotel(hotelId: number): Promise<void> {
  await invokeFunction('switch-hotel', { hotel_id: hotelId });
  const { error } = await supabase.auth.refreshSession();
  if (error) throw new ApiError(500, 'No se pudo activar el hotel: vuelve a iniciar sesion', 'REFRESH_FAILED');
}

/**
 * Activa el hotel sin que un fallo de la edge function corte el flujo.
 *
 * Se usa justo despues de crear el primer hotel. Si switch-hotel no responde
 * —no esta desplegada, no hay red— NO pasa nada grave: current_hotel_id()
 * resuelve solo cuando el usuario pertenece a un unico hotel, que es
 * exactamente el caso al terminar el alta.
 *
 * Antes esto tumbaba el alta entera con "Edge Function returned a non-2xx
 * status code": el hotel quedaba creado en la base pero el usuario veia un
 * error y se quedaba en el asistente, sin saber que ya existia.
 */
export async function activarHotelSiSePuede(hotelId: number): Promise<void> {
  try {
    await switchHotel(hotelId);
  } catch {
    // Se intenta al menos refrescar la sesion; si tampoco, seguimos igual.
    try { await supabase.auth.refreshSession(); } catch { /* sin consecuencias */ }
  }
}

export interface NuevoHotel {
  nombre: string;
  moneda_base?: 'USD' | 'EUR' | 'VES';
  iva_pct?: number;
}

/**
 * Crea un hotel con quien llama como propietario.
 *
 * Arranca con 30 dias de prueba, sus ajustes y sus categorias contables, para
 * que se pueda registrar el primer cobro sin configurar nada antes.
 */
export async function createHotel(datos: NuevoHotel): Promise<number> {
  const { data, error } = await supabase.rpc('create_hotel_with_owner', {
    p_nombre: datos.nombre,
    p_moneda_base: datos.moneda_base ?? 'USD',
    p_iva_pct: datos.iva_pct ?? 16,
  });
  if (error) throw new ApiError(400, error.message, 'HOTEL_CREATE_ERROR');
  return data as number;
}

// ---------------------------------------------------------------------------
// Alta guiada
// ---------------------------------------------------------------------------

export type TipoAlojamiento = 'hotel' | 'posada' | 'cabanas' | 'apartamentos' | 'hostal';

export interface TipoUnidad {
  nombre: string;
  capacidad: number;
  tarifa: number;
  cantidad: number;
}

export interface ConfiguracionHotel {
  nombre: string;
  tipo: TipoAlojamiento;
  /** Codigo ISO 4217 de tres letras. */
  moneda_base: string;
  iva_pct: number;
  tipos: TipoUnidad[];
  metodos: string[];
  modulos: string[];
}

/**
 * Crea el hotel con toda su configuracion en una sola operacion.
 *
 * Va en una unica llamada a proposito: si se hiciera paso a paso desde el
 * navegador, un fallo a mitad dejaria el hotel creado pero sin habitaciones, y
 * el usuario entraria a un sistema a medias sin saber que le falta.
 */
export async function createHotelOnboarding(cfg: ConfiguracionHotel): Promise<number> {
  const { data, error } = await supabase.rpc('create_hotel_onboarding', {
    p_nombre: cfg.nombre,
    p_tipo: cfg.tipo,
    p_moneda_base: cfg.moneda_base,
    p_iva_pct: cfg.iva_pct,
    p_tipos: cfg.tipos,
    p_metodos: cfg.metodos,
    p_modulos: cfg.modulos,
  });
  if (error) throw new ApiError(400, error.message, 'HOTEL_ONBOARDING_ERROR');
  return data as number;
}

export interface HotelConfig {
  hotel_id: number;
  nombre: string;
  tipo: TipoAlojamiento;
  moneda_base: string;
  iva_pct: number;
  metodos: string[];
  modulos: string[];
}

/** Configuracion del hotel activo: que menus enseñar y que cobros ofrecer. */
export async function getHotelConfig(): Promise<HotelConfig | null> {
  const { data, error } = await supabase.rpc('my_hotel_config');
  if (error) throw new ApiError(400, error.message, 'HOTEL_CONFIG_ERROR');
  const row = Array.isArray(data) ? data[0] : data;
  return (row as HotelConfig | undefined) ?? null;
}
