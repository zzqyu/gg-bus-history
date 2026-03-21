#!/usr/bin/env python3
"""
import_to_sqlite.py

Reads single-line TXT files where columns are '|' and rows are separated by '^'.
First row (before first '^') is header, following rows are data.
Creates or opens an SQLite database and writes each TXT file to a table named
after the file (filename without extension). All columns are created as TEXT.

Usage:
    python import_to_sqlite.py --dir /path/to/dir --db data.db

This script also supports renaming existing tables in the target SQLite DB
to remove trailing version suffixes (yyyymmdd...); use `--rename-db-tables`.

"""
from pathlib import Path
import re
import argparse
import sqlite3
import sys
import logging
from typing import Optional
import urllib.request
import json
import os
from urllib.parse import urlparse, parse_qsl, urlencode, urlunparse

try:
    import resource
except Exception:  # pragma: no cover
    resource = None

logging.basicConfig(level=logging.INFO, format='%(message)s')


def sanitize_identifier(name: str) -> str:
    # Remove problematic characters and collapse spaces
    s = name.strip()
    s = s.replace('"', '')
    s = s.replace('\n', ' ').replace('\r', ' ')
    s = '_'.join(s.split())
    if not s:
        s = 'col'
    return s


def strip_version_suffix(name: str) -> str:
    # Remove trailing yyyymmdd and any following chars, with optional separator
    # Examples: route20260314V2 -> route, route_20260314 -> route
    return re.sub(r'[_-]?\d{8}.*$', '', name)


def load_env_local(path: str = '.env.local'):
    """Load simple KEY=VALUE pairs from .env.local into os.environ if not set."""
    p = Path(path)
    if not p.exists():
        return
    try:
        for line in p.read_text(encoding='utf-8').splitlines():
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                continue
            k, v = line.split('=', 1)
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and (k not in os.environ):
                os.environ[k] = v
    except Exception:
        # ignore parsing errors
        return


def build_baseinfo_url(base_url: str, service_key: Optional[str]):
    """Return a full baseinfo URL with serviceKey and format=json merged into query."""
    parsed = urlparse(base_url)
    qlist = parse_qsl(parsed.query, keep_blank_values=True)
    qdict = dict(qlist)
    if service_key:
        qdict.setdefault('serviceKey', service_key)
    qdict.setdefault('format', 'json')
    new_query = urlencode(qdict, doseq=True)
    new_parsed = parsed._replace(query=new_query)
    return urlunparse(new_parsed)


def download_url_to_file(url: str, out_path: Path, overwrite: bool = False):
    if out_path.exists() and not overwrite:
        logging.info(f"Skipping existing file: {out_path}")
        return
    logging.info(f"Downloading {url} -> {out_path}")
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "import_to_sqlite/1.0"})
        with urllib.request.urlopen(req) as resp:
            data = resp.read()
        out_path.write_bytes(data)
        logging.info(f"Saved {out_path} ({len(data)} bytes)")
    except Exception as e:
        logging.error(f"Failed to download {url}: {e}")
        raise


def download_from_baseinfo(baseinfo_url: str, out_dir: Path, ext: str = '.txt', overwrite: bool = False):
    logging.info(f"Fetching base info JSON from {baseinfo_url}")
    req = urllib.request.Request(baseinfo_url, headers={"User-Agent": "import_to_sqlite/1.0"})
    with urllib.request.urlopen(req) as r:
        raw = r.read()
    try:
        j = json.loads(raw.decode('utf-8'))
    except Exception as e:
        logging.error(f"Failed to parse baseinfo JSON: {e}")
        raise

    # navigate to baseInfoItem
    try:
        body = j.get('response', {}).get('msgBody', {})
        item = body.get('baseInfoItem', {})
    except Exception:
        item = None

    if not item:
        logging.error('No baseInfoItem found in JSON')
        raise RuntimeError('No baseInfoItem')

    # collect download URLs (keys that end with 'DownloadUrl')
    urls = []
    for k, v in item.items():
        if not v:
            continue
        lk = k.lower()
        if 'downloadurl' in lk and isinstance(v, str):
            urls.append(v)

    if not urls:
        logging.info('No download URLs found in baseInfoItem')
        return

    for url in urls:
        # determine filename from URL path; many endpoints use a generic /download path
        parsed = urlparse(url)
        fname = os.path.basename(parsed.path)
        # If path basename is generic (e.g. 'download' or empty), try to extract from query
        if not fname or fname.lower() in ('download', 'ws', 'index', 'api'):
            q = parsed.query or ''
            candidate = ''
            if q:
                # split on & and try to take last part after '=' if present
                parts = q.split('&')
                for part in reversed(parts):
                    if '=' in part:
                        candidate = part.split('=')[-1]
                    else:
                        candidate = part
                    candidate = candidate.strip()
                    if candidate:
                        break
            # if candidate looks like a filename (has an extension), use it
            if candidate and re.search(r"\.[a-zA-Z0-9]{2,6}$", candidate):
                fname = candidate
            else:
                # fallback to a generated name using netloc and a short hash
                base_hint = parsed.netloc.replace(':', '_') if parsed.netloc else 'file'
                fname = f"{base_hint}_{abs(hash(url))%100000}{ext}"

        out_path = out_dir / fname
        download_url_to_file(url, out_path, overwrite=overwrite)


def rename_db_tables(conn: sqlite3.Connection):
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [r[0] for r in cur.fetchall()]

    for old in tables:
        new = strip_version_suffix(old)
        if new == old or new == '':
            logging.info(f"Skipping {old}")
            continue

        new = new.replace('"', '').strip()
        if not new:
            logging.info(f"Skipping {old} (empty target name)")
            continue

        target = new
        i = 1
        cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (target,))
        while cur.fetchone() is not None:
            if target == old:
                break
            target = f"{new}_{i}"
            i += 1

        if target == old:
            logging.info(f"Target name for {old} equals old name; skipping")
            continue

        logging.info(f"Renaming {old} -> {target}")
        cur.execute(f'ALTER TABLE "{old}" RENAME TO "{target}"')

    conn.commit()


def set_process_memory_limit(memory_limit_mb: int):
    """Set process virtual memory limit on Unix-like systems.
    Helps fail-fast instead of OOM-killing the whole VPS.
    """
    if memory_limit_mb <= 0:
        return
    if resource is None:
        logging.info('resource module not available; skipping memory limit')
        return
    try:
        limit_bytes = int(memory_limit_mb) * 1024 * 1024
        resource.setrlimit(resource.RLIMIT_AS, (limit_bytes, limit_bytes))
        logging.info(f"Applied process memory limit: {memory_limit_mb} MB")
    except Exception as e:
        logging.warning(f"Failed to apply memory limit ({memory_limit_mb} MB): {e}")


def iter_caret_rows(path: Path, read_chunk_chars: int = 1024 * 1024):
    """Yield '^'-separated rows from file without loading entire file into memory."""
    with path.open('r', encoding='utf-8', errors='replace') as f:
        buf = ''
        while True:
            chunk = f.read(read_chunk_chars)
            if not chunk:
                break
            buf += chunk
            parts = buf.split('^')
            buf = parts.pop() if parts else ''
            for p in parts:
                row = p.strip()
                if row:
                    yield row

        tail = buf.strip()
        if tail:
            yield tail


def process_file(path: Path, conn: sqlite3.Connection, batch_size: int = 2000, read_chunk_chars: int = 1024 * 1024):
    rows_iter = iter_caret_rows(path, read_chunk_chars=read_chunk_chars)

    try:
        header_line = next(rows_iter)
    except StopIteration:
        logging.info(f"No rows found in {path.name}")
        return

    if not header_line:
        logging.info(f"Skipping empty file: {path.name}")
        return

    headers = [h.strip() for h in header_line.split('|')]
    headers = [sanitize_identifier(h) for h in headers]

    table = sanitize_identifier(strip_version_suffix(path.stem))

    cur = conn.cursor()

    # Create table
    cols_def = ', '.join([f'"{h}" TEXT' for h in headers])
    create_sql = f'CREATE TABLE IF NOT EXISTS "{table}" ({cols_def});'
    cur.execute(create_sql)

    # Prepare insert
    placeholders = ', '.join(['?'] * len(headers))
    column_list = ', '.join([f'"{h}"' for h in headers])
    insert_sql = f'INSERT INTO "{table}" ({column_list}) VALUES ({placeholders})'

    to_insert = []
    inserted = 0
    for row in rows_iter:
        vals = [v.strip() for v in row.split('|')]
        # pad or trim to match headers
        if len(vals) < len(headers):
            vals += [None] * (len(headers) - len(vals))
        elif len(vals) > len(headers):
            vals = vals[:len(headers)]
        to_insert.append(tuple(vals))

        if len(to_insert) >= batch_size:
            cur.executemany(insert_sql, to_insert)
            conn.commit()
            inserted += len(to_insert)
            to_insert = []

    if to_insert:
        cur.executemany(insert_sql, to_insert)
        conn.commit()
        inserted += len(to_insert)

    if inserted > 0:
        logging.info(f"Imported {inserted} rows into table '{table}' from {path.name}")
    else:
        logging.info(f"No data rows to insert for {path.name}")


def main():
    p = argparse.ArgumentParser(description='Import ^-separated single-line TXT files into SQLite')
    p.add_argument('--dir', '-d', default='.', help='Directory containing TXT files')
    p.add_argument('--db', default='data.db', help='SQLite database file to create/use')
    p.add_argument('--ext', default='.txt', help='File extension to process (default: .txt)')
    p.add_argument('--fetch-baseinfo', action='store_true', help='Fetch baseInfo JSON and download listed TXT files before importing')
    p.add_argument('--baseinfo-url', default='https://apis.data.go.kr/6410000/baseinfoservice/v2/getBaseInfoItemv2', help='Base info JSON URL to query (serviceKey will be read from .env.local or env)')
    p.add_argument('--clean-downloads', action='store_true', help='Remove existing files in --dir before fetching')
    p.add_argument('--overwrite', action='store_true', help='Overwrite existing downloaded files')
    p.add_argument('--list-downloads', action='store_true', help='List downloaded files in --dir and exit')
    p.add_argument('--rename-db-tables', action='store_true', help='Rename existing DB tables by stripping trailing yyyymmdd* suffixes')
    p.add_argument('--batch-size', type=int, default=2000, help='Rows per SQLite executemany batch (default: 2000)')
    p.add_argument('--read-chunk-chars', type=int, default=1024 * 1024, help='Chunk size for streaming parser (default: 1048576)')
    p.add_argument('--low-memory', action='store_true', help='Apply conservative SQLite memory PRAGMAs')
    p.add_argument('--memory-limit-mb', type=int, default=0, help='Optional process memory cap in MB (Linux/Unix only)')
    args = p.parse_args()

    if args.batch_size <= 0:
        logging.error('--batch-size must be > 0')
        sys.exit(1)
    if args.read_chunk_chars <= 0:
        logging.error('--read-chunk-chars must be > 0')
        sys.exit(1)

    set_process_memory_limit(args.memory_limit_mb)

    # load .env.local if present (to pick up BASEINFO_SERVICE_KEY)
    load_env_local('.env.local')

    base = Path(args.dir)
    if not base.exists():
        try:
            base.mkdir(parents=True, exist_ok=True)
            logging.info(f"Created directory: {base}")
        except Exception as e:
            logging.error(f"Failed to create directory {args.dir}: {e}")
            sys.exit(1)
    elif not base.is_dir():
        logging.error(f"Path exists but is not a directory: {args.dir}")
        sys.exit(1)

    db_path = Path(args.db)
    conn = sqlite3.connect(str(db_path))

    if args.low_memory:
        try:
            cur = conn.cursor()
            cur.execute('PRAGMA temp_store=FILE;')
            cur.execute('PRAGMA cache_size=-32768;')  # about 32MB cache
            cur.execute('PRAGMA mmap_size=0;')
            # journal_mode PRAGMA returns a row; consume it to avoid
            # "cannot commit transaction - SQL statements in progress".
            cur.execute('PRAGMA journal_mode=DELETE;')
            _ = cur.fetchone()
            logging.info('Applied low-memory SQLite PRAGMAs')
        except Exception as e:
            logging.warning(f'Failed to apply low-memory PRAGMAs: {e}')

    # Optionally fetch baseinfo JSON and download files
    if args.fetch_baseinfo:
        try:
            base_dir = Path(args.dir)
            out_dir = base_dir
            out_dir.mkdir(parents=True, exist_ok=True)
            # Optionally clean existing downloaded files
            if args.clean_downloads:
                removed = 0
                for ex_f in list(out_dir.glob(f'*{args.ext}')):
                    try:
                        ex_f.unlink()
                        removed += 1
                    except Exception:
                        pass
                logging.info(f"Removed {removed} existing files from {out_dir}")
            # build URL with service key from env if needed
            burl = args.baseinfo_url
            # if base URL does not already contain serviceKey, try to load from env
            if 'serviceKey=' not in burl:
                svc = os.environ.get('BASEINFO_SERVICE_KEY') or os.environ.get('SERVICE_KEY')
                if not svc:
                    logging.error('Service key for baseinfo not found. Set BASEINFO_SERVICE_KEY in .env.local or environment.')
                    conn.close()
                    sys.exit(1)
                burl = build_baseinfo_url(burl, svc)
            download_from_baseinfo(burl, out_dir, ext=args.ext, overwrite=args.overwrite)
        except Exception as e:
            logging.error(f"Failed to fetch/download baseinfo files: {e}")
            conn.close()
            sys.exit(1)

    # If requested, list available downloaded files in --dir and exit
    if args.list_downloads:
        files_list = sorted(base.glob(f'*{args.ext}'))
        if files_list:
            logging.info('Downloaded files:')
            for fpath in files_list:
                print(str(fpath))
        else:
            logging.info('No downloaded files found.')
        conn.close()
        return

    if args.rename_db_tables:
        rename_db_tables(conn)

    files = sorted(base.glob(f'*{args.ext}'))
    if not files:
        logging.info(f"No files with extension {args.ext} found in {args.dir}")
        conn.close()
        return

    for f in files:
        try:
            process_file(f, conn, batch_size=args.batch_size, read_chunk_chars=args.read_chunk_chars)
        except Exception as e:
            logging.error(f"Error processing {f.name}: {e}")

    conn.close()


if __name__ == '__main__':
    main()
