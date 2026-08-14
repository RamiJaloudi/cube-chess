from __future__ import annotations

import argparse
import json

from .config import Settings
from .storage import Database


def main() -> None:
    parser = argparse.ArgumentParser(description="Cube Chess API administration")
    subcommands = parser.add_subparsers(dest="command", required=True)
    create_key = subcommands.add_parser("create-key", help="Create an API key and print it once")
    create_key.add_argument("--label", required=True)
    subcommands.add_parser("status", help="Show durable match status without secrets")
    args = parser.parse_args()

    settings = Settings.from_env()
    database = Database(settings.database_path, settings.token_pepper)
    if args.command == "create-key":
        created = database.create_api_key(args.label)
        print(json.dumps(created, indent=2))
    elif args.command == "status":
        print(json.dumps({"database": str(settings.database_path), "activeMatch": database.active_match(), "matches": database.list_matches()}, indent=2))


if __name__ == "__main__":
    main()
