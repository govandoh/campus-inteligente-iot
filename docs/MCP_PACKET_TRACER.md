# MCP de Packet Tracer (opcional, solo en la laptop de quien lo use)

Permite que Claude Code lea y configure el `.pkt` abierto en Packet Tracer. Proyecto: [Mats2208/MCP-Packet-Tracer](https://github.com/Mats2208/MCP-Packet-Tracer) v0.9.0 (licencia MIT), fijado al commit `846db38`.

## Instalación (ya hecha en la laptop de Gerardo)

```powershell
py -3.13 -m venv $env:LOCALAPPDATA\pt-mcp\venv
& $env:LOCALAPPDATA\pt-mcp\venv\Scripts\python.exe -m pip install "git+https://github.com/Mats2208/MCP-Packet-Tracer@846db381bc2c6ee0229d56e1d7ce8847eb6b213d"
claude mcp add --scope project --transport stdio packet-tracer "--" "$env:LOCALAPPDATA\pt-mcp\venv\Scripts\python.exe" -m packet_tracer_mcp --stdio
```

Módulo para Packet Tracer: `V5.2.pts` de la release v0.9.0. SHA‑256 verificado: `175f775560af7c17348c3d20cffc81ae5dc8d294d2486cc9e8409fbead8bc071`.

## Medidas de seguridad aplicadas

- Transporte **stdio**: no abre un servidor HTTP.
- `pt_send_raw`, que ejecuta JavaScript arbitrario en PT, está **bloqueada** en `.claude/settings.json`.
- El puente con PT escucha solo en `127.0.0.1:54321` y exige un token aleatorio guardado en `%LOCALAPPDATA%\packet-tracer-mcp\`.
- `.mcp.json` no se sube al repo porque tiene rutas locales.
- Mientras el puente está activo, no navegar en sitios no confiables.

## Uso en cada sesión

1. Abrir Packet Tracer 8.2.2 o superior.
2. Solo la primera vez: **Extensions → Scripting → Configure PT Script Modules → Add…** y elegir `%LOCALAPPDATA%\pt-mcp\V5.2.pts`.
3. Abrir el `.pkt` y luego **Extensions → MCP BUILDER** (ventana *MCP Control Center*).
4. En Claude Code, aprobar el servidor `packet-tracer` (comando `/mcp`).
5. Al terminar, **guardar el `.pkt` en PT** (Ctrl+S) y hacer commit. Packet Tracer no guarda solo.
