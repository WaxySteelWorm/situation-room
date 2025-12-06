"""Main FastAPI application for Situation Room."""

import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

from .config import load_config
from .models.database import init_db
from .utils.logging import setup_logging
from .routers import auth_router, tasks_router, credentials_router, dashboard_router, documents_router, columns_router, uploads_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    config = load_config()
    setup_logging()
    logger.info("Starting Situation Room...")

    # Initialize database
    await init_db()
    logger.info("Database initialized")

    # Log configuration info
    logger.info(f"Server: {config.server.host}:{config.server.port}")
    logger.info(f"Debug mode: {config.server.debug}")
    logger.info(f"Users configured: {len(config.users)}")

    yield

    # Shutdown
    logger.info("Shutting down Situation Room...")


app = FastAPI(
    title="Situation Room",
    description="Internal dashboard for team task management and credential storage",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS middleware (for development)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(auth_router)
app.include_router(tasks_router)
app.include_router(credentials_router)
app.include_router(dashboard_router)
app.include_router(documents_router)
app.include_router(columns_router)
app.include_router(uploads_router)


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "situation-room"}


# Serve static files (frontend build)
static_path = Path(__file__).parent / "static"
if static_path.exists():
    app.mount("/assets", StaticFiles(directory=static_path / "assets"), name="assets")


# Catch-all route for SPA (must be last)
@app.get("/{full_path:path}")
async def serve_spa(request: Request, full_path: str):
    """Serve the SPA for all non-API routes."""
    # Skip API routes
    if full_path.startswith("api/"):
        return {"detail": "Not found"}

    index_path = Path(__file__).parent / "static" / "index.html"
    if index_path.exists():
        return FileResponse(index_path)

    # Return a basic HTML page if no frontend build exists
    return FileResponse(
        Path(__file__).parent / "static" / "index.html",
        media_type="text/html",
    )


if __name__ == "__main__":
    import uvicorn

    config = load_config()
    uvicorn.run(
        "app.main:app",
        host=config.server.host,
        port=config.server.port,
        reload=config.server.debug,
    )
