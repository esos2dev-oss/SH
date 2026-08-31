// Identidad visible del producto, en un unico sitio.
//
// Antes el nombre y el logo del cliente (El Pinar) estaban escritos a mano en
// cuatro componentes distintos. Al pasar a producto vendible eso no vale: cada
// hotel tiene el suyo.
//
// Siguiente paso, cuando exista la capa multi-hotel: APP_NAME sale del setting
// 'hotel.nombre' (ya existe en la tabla settings) y APP_LOGO del logo que suba
// cada hotel. El resto del codigo no tendra que cambiar, porque todos los
// componentes leen de aqui.
export const APP_NAME = 'Sistema Hotelero';
export const APP_TAGLINE = 'Gestion hotelera integral';
export const APP_LOGO = '/sh/favicon.svg';
