// Métricas derivadas y utilidades de red.

// Índice de calor (sensación térmica) — fórmula de Rothfusz (NOAA), en °C.
export function heatIndex(tempC, hum) {
  if (tempC == null || hum == null) return null;
  const T = tempC * 1.8 + 32;
  let hi = 0.5 * (T + 61 + (T - 68) * 1.2 + hum * 0.094);
  if (hi >= 80) {
    hi =
      -42.379 + 2.04901523 * T + 10.14333127 * hum - 0.22475541 * T * hum -
      0.00683783 * T * T - 0.05481717 * hum * hum + 0.00122874 * T * T * hum +
      0.00085282 * T * hum * hum - 0.00000199 * T * T * hum * hum;
  }
  return round1((hi - 32) / 1.8);
}

// Punto de rocío — aproximación de Magnus, en °C.
export function dewPoint(tempC, hum) {
  if (tempC == null || hum == null || hum <= 0) return null;
  const a = 17.62, b = 243.12;
  const g = Math.log(hum / 100) + (a * tempC) / (b + tempC);
  return round1((b * g) / (a - g));
}

export const round1 = (n) => (n == null || Number.isNaN(n) ? null : Math.round(n * 10) / 10);

const ipToInt = (ip) =>
  String(ip).split('.').reduce((acc, oct) => (acc << 8) + (Number(oct) & 255), 0) >>> 0;

// ¿La IP pertenece a la subred indicada? (ej. 10.10.3.0/25 = VLAN 60)
export function inSubnet(ip, { network, prefix }) {
  if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (ipToInt(ip) & mask) === (ipToInt(network) & mask);
}
