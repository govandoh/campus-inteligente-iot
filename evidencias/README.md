# Evidencias

Guardar aquí las capturas (PNG) con este formato de nombre: `pXX-descripcion.png` (XX = número de la prueba obligatoria).

| # | Prueba | Resultado esperado | Archivo(s) | Responsable | Estado |
|---|---|---|---|---|---|
| 1 | Cliente obtiene IP por DHCP | IP correcta según VLAN | `p01-dhcp-*.png` | | ☐ |
| 2 | VLAN autorizadas | Comunicación permitida | `p02-*.png` | | ☐ |
| 3 | VLAN no autorizadas | Comunicación bloqueada | `p03-acl-iot-ping-bloqueado.png`, `p03-show-access-lists.png` | Equipo B | ☐ |
| 4 | Administración SSH | Permitida desde VLAN 99 | `p04-ssh-*.png` | | ☐ |
| 5 | ESP32 | Conectividad en VLAN 60 | `p05-pt-sbc-ip.png`, `p05-esp32-monitor-serie.png` | B / A | ☐ |
| 6 | ESP32 → servidor | Datos recibidos | `p06-mosquitto-sub.png` | Equipo A | ☐ |
| 7 | Dashboard | Datos visibles | `p07-dashboard-esp32.png`, `p07-evidencias.png`, `p07-grafana.png` | Equipo A | ☐ |
| 8 | OSPF | Vecindades/rutas operativas | `p08-ospf-*.png` | | ☐ |
| 9 | Falla simulada | Respuesta documentada | `p09-esp32-last-will.png`, `p09-*.png` | | ☐ |
| 10 | Fibra | Presupuesto óptico válido | `p10-presupuesto-optico.png` | | ☐ |

Extras IoT: `extra-puente-packet-tracer.png`, `extra-montaje-fisico.jpg`, `extra-lecturas.csv`.
