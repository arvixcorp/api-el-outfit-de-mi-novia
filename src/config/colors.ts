/**
 * Colores ANSI mínimos para la consola de desarrollo. Se desactivan solos en producción,
 * cuando la salida no es una terminal (logs de Dokploy, archivos) o si existe NO_COLOR.
 * FORCE_COLOR=1 los fuerza.
 */
export const colorEnabled =
  !process.env["NO_COLOR"] &&
  process.env["NODE_ENV"] !== "production" &&
  process.env["NODE_ENV"] !== "test" &&
  (!!process.env["FORCE_COLOR"] || process.stdout.isTTY === true);

const wrap = (open: number, close = 39) => (s: string | number) =>
  colorEnabled ? `\u001b[${open}m${s}\u001b[${close}m` : String(s);

export const c = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31),
  green: wrap(32),
  yellow: wrap(33),
  blue: wrap(34),
  magenta: wrap(35),
  cyan: wrap(36),
  gray: wrap(90),
  /** Rosa pastel (paleta de 256 colores) a juego con la app. */
  pink: (s: string | number) => (colorEnabled ? `\u001b[38;5;218m${s}\u001b[39m` : String(s)),
  rose: (s: string | number) => (colorEnabled ? `\u001b[38;5;211m${s}\u001b[39m` : String(s)),
};

/** Fondo de color con texto oscuro: insignias tipo " INFO ". */
export const badge = (text: string, bg: number) =>
  colorEnabled ? `\u001b[30;${bg}m\u001b[1m ${text} \u001b[22m\u001b[39;49m` : `[${text.trim()}]`;
