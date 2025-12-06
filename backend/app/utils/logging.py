"""Logging configuration for Situation Room."""

import logging
import sys

from ..config import get_config


def setup_logging() -> None:
    """Configure logging based on config settings."""
    config = get_config()

    # Map config level to logging level
    level_map = {
        "debug": logging.DEBUG,
        "info": logging.INFO,
        "warning": logging.WARNING,
        "error": logging.ERROR,
    }

    level = level_map.get(config.logging.level.lower(), logging.INFO)

    # Configure root logger
    logging.basicConfig(
        level=level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Set specific loggers
    logging.getLogger("uvicorn").setLevel(level)
    logging.getLogger("uvicorn.access").setLevel(level)
    logging.getLogger("sqlalchemy.engine").setLevel(
        logging.DEBUG if config.logging.level == "debug" else logging.WARNING
    )

    logger = logging.getLogger(__name__)
    logger.info(f"Logging configured at level: {config.logging.level}")
