"""Safe, repeatable, data-class-aware management of the SQLite database.

The five tables fall into three "data classes" that decide what is safe to wipe:

  EPHEMERAL  — regenerable crawl cache, safe to wipe any time:
                 - documents (all rows)
                 - market_intelligence rows where category == 'NEWS' or IS NULL
  USER       — precious user artifacts, never wiped by default:
                 - simulations (all rows)
                 - theses (all rows)
                 - market_intelligence rows where category in ('USER_ASSET','RESEARCH')
  REFERENCE  — semi-permanent reference data, only wiped when explicitly forced:
                 - nps_snapshots (all rows)

This module is the single source of truth for that mapping (see TARGETS below)
and exposes both a callable reset_database() and a CLI:

    python -m app.db_admin reset --scope ephemeral        # default cache wipe
    python -m app.db_admin reset --scope user             # clear user artifacts
    python -m app.db_admin reset --scope all              # everything except nps_snapshots
    python -m app.db_admin reset --scope all --force-reference   # also clear nps_snapshots

By default the CLI only PREVIEWS the plan (before counts + what would clear).
Pass --yes to actually perform the deletion.
"""
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from enum import Enum
from typing import Optional

from sqlalchemy import text
from sqlalchemy.engine import Engine


class DataClass(str, Enum):
    EPHEMERAL = "ephemeral"
    USER = "user"
    REFERENCE = "reference"


@dataclass(frozen=True)
class Target:
    """One deletable slice of the DB, tagged with its data class.

    `where` is a raw SQL predicate (without the WHERE keyword); None means the
    whole table. `label` is what the summary prints.
    """
    table: str
    data_class: DataClass
    where: Optional[str]
    label: str


# ── SINGLE SOURCE OF TRUTH ──────────────────────────────────────────────────
# Every wipeable slice of the database, mapped to its data class. Anything not
# listed here is never touched by a reset.
TARGETS: list[Target] = [
    Target("documents", DataClass.EPHEMERAL, None, "documents"),
    Target(
        "market_intelligence",
        DataClass.EPHEMERAL,
        "category = 'NEWS' OR category IS NULL",
        "market_intelligence (NEWS / null)",
    ),
    Target(
        "market_intelligence",
        DataClass.USER,
        "category IN ('USER_ASSET', 'RESEARCH')",
        "market_intelligence (USER_ASSET / RESEARCH)",
    ),
    Target("simulations", DataClass.USER, None, "simulations"),
    Target("theses", DataClass.USER, None, "theses"),
    Target("nps_snapshots", DataClass.REFERENCE, None, "nps_snapshots"),
]

# Which data classes each scope targets. REFERENCE is never included by scope —
# it is only ever added by the explicit --force-reference flag.
SCOPE_CLASSES: dict[str, set[DataClass]] = {
    "ephemeral": {DataClass.EPHEMERAL},
    "user": {DataClass.USER},
    "all": {DataClass.EPHEMERAL, DataClass.USER},
}

VALID_SCOPES = tuple(SCOPE_CLASSES.keys())


def _get_engine(engine: Optional[Engine]) -> Engine:
    """Return the passed engine, or the live app engine if none given."""
    if engine is not None:
        return engine
    from app.db import engine as app_engine  # lazy: avoid import side effects
    return app_engine


def _count(conn, target: Target) -> int:
    sql = f"SELECT COUNT(*) FROM {target.table}"
    if target.where is not None:
        sql += f" WHERE {target.where}"
    return conn.execute(text(sql)).scalar() or 0


def classes_for_scope(scope: str, force_reference: bool = False) -> set[DataClass]:
    """Resolve a scope (+ optional force flag) to the set of data classes it clears."""
    if scope not in SCOPE_CLASSES:
        raise ValueError(
            f"Unknown scope {scope!r}. Choose one of: {', '.join(VALID_SCOPES)}"
        )
    classes = set(SCOPE_CLASSES[scope])
    if force_reference:
        classes.add(DataClass.REFERENCE)
    return classes


def reset_database(
    scope: str,
    *,
    force_reference: bool = False,
    engine: Optional[Engine] = None,
    dry_run: bool = False,
) -> dict:
    """Clear the DB by scope. An explicit scope is always required.

    Returns a summary dict::

        {
          "scope": "ephemeral",
          "classes": ["ephemeral"],
          "dry_run": False,
          "targets": [{"label","table","data_class","cleared","before","after"}],
          "total_deleted": 42,
        }

    When dry_run is True nothing is deleted and "after" reflects current counts.
    """
    eng = _get_engine(engine)
    classes = classes_for_scope(scope, force_reference)
    to_clear = {(t.table, t.where) for t in TARGETS if t.data_class in classes}

    rows: list[dict] = []
    total_deleted = 0

    # Counts + (optionally) deletes run in one transaction so the summary is
    # consistent. VACUUM is run separately afterwards (cannot run in a txn).
    with eng.begin() as conn:
        for t in TARGETS:
            before = _count(conn, t)
            cleared = (t.table, t.where) in to_clear
            after = before
            if cleared and before > 0:
                if dry_run:
                    # Report what WOULD be deleted without touching anything.
                    total_deleted += before
                else:
                    sql = f"DELETE FROM {t.table}"
                    if t.where is not None:
                        sql += f" WHERE {t.where}"
                    conn.execute(text(sql))
                    after = _count(conn, t)
                    total_deleted += before - after
            rows.append({
                "label": t.label,
                "table": t.table,
                "data_class": t.data_class.value,
                "cleared": cleared,
                "before": before,
                "after": after,
            })

    if total_deleted > 0 and not dry_run:
        # VACUUM must run outside a transaction.
        with eng.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
            conn.execute(text("VACUUM"))

    return {
        "scope": scope,
        "classes": sorted(c.value for c in classes),
        "dry_run": dry_run,
        "targets": rows,
        "total_deleted": total_deleted,
    }


def _print_summary(summary: dict) -> None:
    mode = "DRY RUN (no changes written)" if summary["dry_run"] else "APPLIED"
    print(f"\nDB reset - scope={summary['scope']} "
          f"classes=[{', '.join(summary['classes'])}] - {mode}")
    print("-" * 78)
    print(f"{'target':<44}{'class':<11}{'before':>7}{'after':>7}  action")
    print("-" * 78)
    for r in summary["targets"]:
        action = "CLEAR" if r["cleared"] else "keep"
        print(f"{r['label']:<44}{r['data_class']:<11}"
              f"{r['before']:>7}{r['after']:>7}  {action}")
    print("-" * 78)
    verb = "would delete" if summary["dry_run"] else "deleted"
    print(f"Total rows {verb}: {summary['total_deleted']}\n")


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m app.db_admin",
        description="Safe, data-class-aware reset of the SQLite database.",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    reset = sub.add_parser("reset", help="Clear rows by data-class scope.")
    reset.add_argument(
        "--scope",
        choices=VALID_SCOPES,
        default="ephemeral",
        help="ephemeral=regenerable cache (default), user=user artifacts, "
             "all=everything except nps_snapshots.",
    )
    reset.add_argument(
        "--force-reference",
        action="store_true",
        help="Also clear REFERENCE data (nps_snapshots). Use with great care.",
    )
    reset.add_argument(
        "--yes",
        action="store_true",
        help="Actually perform the deletion. Without this, only a preview is shown.",
    )
    return parser


def main(argv: Optional[list[str]] = None) -> int:
    args = _build_parser().parse_args(argv)
    if args.command == "reset":
        dry_run = not args.yes
        summary = reset_database(
            args.scope,
            force_reference=args.force_reference,
            dry_run=dry_run,
        )
        _print_summary(summary)
        if dry_run:
            print("This was a preview. Re-run with --yes to apply.\n")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
