/**
 * Express.js backend server
 * Main entry point for the API
 */

import express, { Express, Request, Response } from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { getPool, testConnection, closePool, closePricingPool } from "./config/database";
import formsRoutes from "./routes/forms.routes";
import ordersRoutes from "./routes/orders.routes";
import raynetRoutes from "./routes/raynet.routes";
import customersRoutes from "./routes/customers.routes";

// Load environment variables
dotenv.config();

const app: Express = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger configuration
const swaggerOptions: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Forms API",
      version: "1.0.0",
      description: "API for managing form submissions with PostgreSQL storage",
      contact: {
        name: "API Support",
      },
    },
    servers: [
      {
        url: `http://localhost:${PORT}`,
        description: "Development server",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter JWT token obtained from NextAuth session",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
  apis: ["./src/routes/*.ts", "./src/index.ts"], // Paths to files containing OpenAPI definitions
};

const swaggerSpec = swaggerJsdoc(swaggerOptions);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Health check endpoint
/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check endpoint
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Server is healthy
 */
app.get("/health", async (req: Request, res: Response) => {
  try {
    // Test database connection
    await testConnection();
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error: any) {
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error.message,
    });
  }
});

// API routes
app.use("/api/forms", formsRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/raynet", raynetRoutes);
app.use("/api/customers", customersRoutes);

// Root endpoint
app.get("/", (req: Request, res: Response) => {
  res.json({
    message: "Forms API Server",
    version: "1.0.0",
    docs: "/api-docs",
    health: "/health",
  });
});

// Error handling middleware
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: process.env.NODE_ENV === "development" ? err.message : undefined,
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: "Not found",
    path: req.path,
  });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}/api-docs`);

  // Test database connection on startup
  try {
    await testConnection();
  } catch (error) {
    console.error("Failed to connect to database:", error);
    console.error("Please ensure DATABASE_URL is set correctly");
  }
});

// Graceful shutdown
async function shutdown(): Promise<void> {
  await closePool();
  try {
    await closePricingPool();
  } catch (e) {
    console.error("Error closing pricing pool:", e);
  }
}

process.on("SIGTERM", async () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(async () => {
    console.log("HTTP server closed");
    await shutdown();
    process.exit(0);
  });
});

process.on("SIGINT", async () => {
  console.log("SIGINT signal received: closing HTTP server");
  server.close(async () => {
    console.log("HTTP server closed");
    await shutdown();
    process.exit(0);
  });
});

export default app;
