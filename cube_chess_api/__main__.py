from __future__ import annotations

import os

import uvicorn


if __name__ == "__main__":
    uvicorn.run(
        "cube_chess_api.main:app",
        host=os.getenv("CUBE_CHESS_API_HOST", "127.0.0.1"),
        port=int(os.getenv("CUBE_CHESS_API_PORT", "8000")),
        reload=False,
    )
