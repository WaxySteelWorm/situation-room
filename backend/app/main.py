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
from .models.database import init_db, get_db
from .utils.logging import setup_logging
from .routers import auth_router, tasks_router, credentials_router, dashboard_router, documents_router, columns_router, uploads_router, users_router, monitoring_router, network_router

logger = logging.getLogger(__name__)

# Background tasks
_retention_task: asyncio.Task | None = None
_network_poll_task: asyncio.Task | None = None


async def network_polling_task():
    """Background task for network monitoring (BGP and traffic)."""
    from .services.cloudflare_radar import CloudflareRadarService
    from .services.observium import ObserviumService
    from .services.notification import NotificationService

    logger.info("Network polling task started")

    while True:
        try:
            config = load_config()
            if not config.network.enabled:
                await asyncio.sleep(60)
                continue

            # Poll at the configured interval (default 15 minutes)
            interval_seconds = config.network.cloudflare_radar.check_interval_minutes * 60

            # Get a database session
            async for db in get_db():
                # Poll Cloudflare Radar for BGP updates
                if config.network.cloudflare_radar.enabled:
                    try:
                        radar_service = CloudflareRadarService(db)
                        results = await radar_service.poll_and_update()
                        if results.get("events_recorded", 0) > 0:
                            logger.info(f"Recorded {results['events_recorded']} BGP events")

                        # Send alerts for new events
                        unalerted = await radar_service.get_unalerted_events()
                        if unalerted:
                            notification_service = NotificationService()
                            for event in unalerted:
                                # Send Discord alert
                                await notification_service._send_discord(
                                    f"**BGP Alert**: {event.event_type}\n"
                                    f"ASN: {event.asn}\n"
                                    f"Prefix: {event.prefix or 'N/A'}\n"
                                    f"Severity: {event.severity}\n"
                                    f"Description: {event.description or 'No description'}",
                                    notification_type=None  # Will use default color
                                )
                                await radar_service.mark_event_alerted(event.id)
                            logger.info(f"Sent {len(unalerted)} BGP alerts")
                    except Exception as e:
                        logger.error(f"BGP polling error: {e}")

                # Poll Observium for traffic updates
                if config.network.observium.enabled:
                    try:
                        observium_service = ObserviumService(db)
                        results = await observium_service.poll_and_update()
                        if results.get("samples_recorded", 0) > 0:
                            logger.debug(f"Recorded {results['samples_recorded']} traffic samples")
                    except Exception as e:
                        logger.error(f"Observium polling error: {e}")

                break  # Exit the async for loop after processing

            await asyncio.sleep(interval_seconds)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Network polling task error: {e}")
            await asyncio.sleep(60)  # Wait a bit before retrying


async def monitoring_retention_task():
    """Background task for data retention and cleanup."""
    from .services.monitoring import MonitoringService

    logger.info("Monitoring retention task started")

    while True:
        try:
            # Run every hour
            await asyncio.sleep(3600)

            config = load_config()
            if not config.monitoring.enabled:
                continue

            # Get a database session
            async for db in get_db():
                service = MonitoringService(db)

                # Aggregate old events
                aggregated = await service.aggregate_old_events()
                if aggregated > 0:
                    logger.info(f"Aggregated {aggregated} old threat events")

                # Cleanup stale agents
                stale = await service.cleanup_stale_agents()
                if stale > 0:
                    logger.info(f"Marked {stale} agents as offline")

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Retention task error: {e}")
            await asyncio.sleep(60)  # Wait a bit before retrying


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    global _retention_task, _network_poll_task

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

    # Start monitoring background tasks if enabled
    if config.monitoring.enabled:
        logger.info("Monitoring module enabled")
        _retention_task = asyncio.create_task(monitoring_retention_task())

    # Start network monitoring background task if enabled
    if config.network.enabled:
        logger.info("Network monitoring module enabled")
        logger.info(f"  - Cloudflare Radar: {'enabled' if config.network.cloudflare_radar.enabled else 'disabled'} (ASN: {config.network.cloudflare_radar.asn})")
        logger.info(f"  - Observium: {'enabled' if config.network.observium.enabled else 'disabled'} (Interfaces: {config.network.observium.interfaces})")
        _network_poll_task = asyncio.create_task(network_polling_task())

    yield

    # Shutdown
    logger.info("Shutting down Situation Room...")

    # Cancel background tasks
    if _retention_task:
        _retention_task.cancel()
        try:
            await _retention_task
        except asyncio.CancelledError:
            pass

    if _network_poll_task:
        _network_poll_task.cancel()
        try:
            await _network_poll_task
        except asyncio.CancelledError:
            pass


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
app.include_router(users_router)
app.include_router(monitoring_router)
app.include_router(network_router)


# Health check endpoint
@app.get("/api/health")
async def health_check():
    """Health check endpoint for monitoring."""
    return {"status": "healthy", "service": "situation-room"}


# Agent download endpoints (for easy installation)
# In container: /app/agent, in dev: ../../../agent relative to this file
agent_path = Path("/app/agent")
if not agent_path.exists():
    agent_path = Path(__file__).parent.parent.parent.parent / "agent"


@app.get("/agent/install.sh")
async def get_agent_installer():
    """Serve the agent installer script."""
    script_path = agent_path / "install" / "install.sh"
    if script_path.exists():
        return FileResponse(
            script_path,
            media_type="text/x-shellscript",
            filename="install.sh"
        )
    return {"detail": "Installer not found"}


@app.get("/agent/situation-room-agent.py")
async def get_agent_script():
    """Serve the agent Python script."""
    script_path = agent_path / "situation-room-agent.py"
    if script_path.exists():
        return FileResponse(
            script_path,
            media_type="text/x-python",
            filename="situation-room-agent.py"
        )
    return {"detail": "Agent script not found"}


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
