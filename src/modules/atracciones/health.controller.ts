import { Controller, Get, HttpStatus, Res } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { ConfigService } from "@nestjs/config";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { Response } from "express";
import { performance } from "perf_hooks";

const DB_TIMEOUT_MS = 3000;
const LATENCIA_DEGRADADA_MS = 800;

// Health para el panel de Booking (NodeHealthResponse) y el health check de Azure.
// Consulta la base en cada llamada: así también mantiene activo Supabase.
@ApiTags("Catálogo")
@Controller({ path: ["atracciones/health", "health"], version: ["2", "3"] })
export class HealthController {
  private readonly nodeId: string;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.nodeId = config.get<string>("PARTNER_SERVICE_ID", "NODE_ATR_ARIEL");
  }

  @Get()
  @ApiOperation({ summary: "Healthcheck del microservicio para Booking" })
  @ApiResponse({ status: 200, description: "UP o DEGRADED." })
  @ApiResponse({ status: 503, description: "DOWN: sin conexión a la base." })
  async check(@Res({ passthrough: true }) res: Response) {
    const inicio = performance.now();
    let conectada = false;
    try {
      await Promise.race([
        this.dataSource.query("SELECT 1"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("timeout")), DB_TIMEOUT_MS),
        ),
      ]);
      conectada = true;
    } catch {
      conectada = false;
    }
    const latencia = Math.round(performance.now() - inicio);
    const status = !conectada
      ? "DOWN"
      : latencia > LATENCIA_DEGRADADA_MS
        ? "DEGRADED"
        : "UP";
    if (!conectada) res.status(HttpStatus.SERVICE_UNAVAILABLE);

    return {
      status,
      service: "Atracciones",
      service_id: this.nodeId,
      node_id: this.nodeId,
      node_code: this.nodeId,
      version: "3.0.0",
      database_connected: conectada,
      latency_ms: latencia,
      memory_usage_mb:
        Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
      uptime_seconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
