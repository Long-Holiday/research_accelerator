# AGENTS.md — daily-arXiv-ai-enhanced

## What this is

Daily crawls arXiv (cs.CV, cs.GR, cs.CL, cs.AI) + remote-sensing journals via OpenAlex, summarizes papers with an LLM (DeepSeek/OAI), and publishes as GitHub Pages.

## Two-branch architecture

- **`main`** — code, config, CI workflow, frontend HTML/JS/CSS
- **`data`** — data files only: `data/*.jsonl` (raw + AI-enhanced), `assets/file-list.txt`, `data/*.md` (README content)

Data is **never** committed to `main`. The CI workflow pushes code changes to `main` and data files to `data`.

## Pipeline (in order, all in `.github/workflows/run.yml`)

```bash
# 1. Crawl arXiv (Scrapy spider)
cd daily_arxiv
scrapy crawl arxiv -o ../data/{date}.jsonl

# 2. Crawl OpenAlex journal papers (appends to same file)
python crawl_openalex.py --date {date} --output ../data/{date}.jsonl

# 3. Dedup check — exit codes matter
cd daily_arxiv
python daily_arxiv/check_stats.py
# exit 0 = has_new_content, 1 = no_new_content (stops), 2 = error (stops)

# 4. AI enhancement (requires OPENAI_API_KEY + OPENAI_BASE_URL)
cd ai
python enhance.py --data ../data/{date}.jsonl --max_workers 50

# 5. Convert to Markdown
cd to_md
python convert.py --data ../data/{date}_AI_enhanced_{LANGUAGE}.jsonl

# 6. Update file list
ls data/*.jsonl | sed 's|data/||' > assets/file-list.txt
```

## Local test

`./run.sh` runs the full pipeline. It activates `.venv/` automatically. Run from repo root. In partial mode (no `OPENAI_API_KEY`), it skips AI enhancement + markdown conversion.

## Python setup

- Python 3.12, managed via `uv` (see `uv.lock`)
- `uv sync` to install deps, then `.venv/bin/activate`
- Dependencies: `scrapy`, `arxiv`, `langchain`, `langchain-openai`, `tqdm`
- No test framework, no linting, no typechecking

## Required GitHub configuration

**Secrets** (encrypted): `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `TOKEN_GITHUB`, `ACCESS_PASSWORD`, `OPENALEX_API_KEY`

**Variables** (plaintext): `CATEGORIES`, `LANGUAGE`, `MODEL_NAME`, `EMAIL`, `NAME`

## CI quirks

- Workflow runs daily at 01:30 UTC (`cron: "30 1 * * *"`), also `workflow_dispatch`
- `git config pull.rebase true` + `git config rebase.autoStash true` used before push
- `js/data-config.js` is CI-generated (repo owner/name injected via `sed`)
- `js/auth-config.js` is CI-generated (SHA-256 password hash injected via `sed`)
- Disabled auth = `PASSWORD_HASH=DISABLED_NO_PASSWORD_SET_IN_SECRETS`
- Jekyll `_config.yml` excludes `data/*.md` from build (but they live on `data` branch)

## OpenAlex abstract caveat

- Elsevier-published journals (e.g. ISPRS J P&RS) block ~78% of abstracts in OpenAlex
- `crawl_openalex.py` falls back to the arXiv API for papers with arXiv preprints in `oa_url`
- Stats are logged per journal as: `Abstract stats: X from OpenAlex, Y from arXiv fallback, Z missing`
- IEEE journals (TGRS, JSTARS) and MDPI (Remote Sensing) have 100% abstract coverage

## AI enhancement details

- Uses `langchain` with `ChatOpenAI` + structured output (pydantic `Structure` model)
- Model can be any OAI-compatible endpoint (configurable via `OPENAI_BASE_URL`)
- Default model: `deepseek-chat` (in `daily_arxiv/config.yaml`)
- 6 fields: `tldr`, `motivation`, `method`, `result`, `conclusion`, `remote_sensing_cross`
- `remote_sensing_cross` has special Pydantic validation: must start with "交叉/改进可行性：XX%。"
- Parallel processing with `ThreadPoolExecutor` (default 50 workers)
- Output: `data/{date}_AI_enhanced_{LANGUAGE}.jsonl`
- Handles `langchain_core.exceptions.OutputParserException` by parsing partial JSON from error

## Frontend (GitHub Pages)

- Vanilla JS, no framework
- Data fetched from `data` branch via raw.githubusercontent.com URLs
- `DATA_CONFIG` object in `js/data-config.js` resolves repo/owner for URLs
- Falls back to relative paths on localhost (`data/*.jsonl`) for dev
- Flatpickr for date picking, localStorage for keyword/author preferences
- Supports `?category=`, `?json=`, `?author=`, `?keywords=` URL params for API-like JSON output
