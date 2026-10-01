// Persistencia en SQLite (módulo nativo node:sqlite, sin dependencias externas).
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS readings (
      ts      INTEGER NOT NULL,          -- epoch ms
      node    TEXT    NOT NULL,
      building TEXT,
      temp    REAL,
      hum     REAL,
      motion  INTEGER,
      rssi    INTEGER,
      source  TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_readings_node_ts ON readings(node, ts);
    CREATE TABLE IF NOT EXISTS events (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      node    TEXT,
      kind    TEXT NOT NULL,             -- alert | motion | status | info
      level   TEXT NOT NULL,             -- info | ok | warn | crit
      msg     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);
  `);

  const insReading = db.prepare(
    'INSERT INTO readings (ts, node, building, temp, hum, motion, rssi, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  );
  const insEvent = db.prepare('INSERT INTO events (ts, node, kind, level, msg) VALUES (?, ?, ?, ?, ?)');

  return {
    addReading(r) {
      insReading.run(r.ts, r.node, r.building ?? null, r.temp ?? null, r.hum ?? null,
        r.motion ?? null, r.rssi ?? null, r.source ?? null);
    },

    addEvent(e) {
      const { lastInsertRowid } = insEvent.run(e.ts, e.node ?? null, e.kind, e.level, e.msg);
      return Number(lastInsertRowid);
    },

    // Historial promediado en "buckets" para no mandar miles de puntos al navegador.
    history(node, sinceMs, maxPoints = 600) {
      const span = Date.now() - sinceMs;
      const bucket = Math.max(1000, Math.ceil(span / maxPoints));
      return db
        .prepare(
          `SELECT (ts / ?) * ? AS t, ROUND(AVG(temp), 2) AS temp, ROUND(AVG(hum), 2) AS hum,
                  MAX(motion) AS motion
             FROM readings WHERE node = ? AND ts >= ?
            GROUP BY ts / ? ORDER BY t`
        )
        .all(bucket, bucket, node, sinceMs, bucket);
    },

    recentEvents(limit = 60) {
      return db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
    },

    stats(node, sinceMs) {
      return db
        .prepare(
          `SELECT COUNT(*) AS n, MIN(temp) AS tMin, MAX(temp) AS tMax, ROUND(AVG(temp), 1) AS tAvg,
                  MIN(hum) AS hMin, MAX(hum) AS hMax, ROUND(AVG(hum), 1) AS hAvg,
                  SUM(CASE WHEN motion = 1 THEN 1 ELSE 0 END) AS motionSamples
             FROM readings WHERE node = ? AND ts >= ?`
        )
        .get(node, sinceMs);
    },

    // Minutos con movimiento en la última hora, para el "heatmap" de ocupación.
    motionMinutes(node, sinceMs) {
      return db
        .prepare(
          `SELECT (ts / 60000) * 60000 AS t, MAX(motion) AS m FROM readings
            WHERE node = ? AND ts >= ? GROUP BY ts / 60000 ORDER BY t`
        )
        .all(node, sinceMs);
    },

    exportCsv(node, sinceMs) {
      const rows = db
        .prepare(
          `SELECT ts, node, building, temp, hum, motion, rssi, source FROM readings
            WHERE (? IS NULL OR node = ?) AND ts >= ? ORDER BY ts`
        )
        .all(node ?? null, node ?? null, sinceMs);
      const head = 'fecha_iso,nodo,edificio,temperatura_c,humedad_pct,movimiento,rssi_dbm,fuente';
      const lines = rows.map((r) =>
        [new Date(r.ts).toISOString(), r.node, r.building, r.temp, r.hum, r.motion, r.rssi, r.source].join(',')
      );
      return [head, ...lines].join('\n');
    },

    prune(retentionDays) {
      const cutoff = Date.now() - retentionDays * 86400000;
      db.prepare('DELETE FROM readings WHERE ts < ?').run(cutoff);
      db.prepare('DELETE FROM events WHERE ts < ?').run(cutoff);
    },
  };
}
