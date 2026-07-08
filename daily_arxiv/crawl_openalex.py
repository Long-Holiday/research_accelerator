import os
import re
import sys
import time
import json
import argparse
import xml.etree.ElementTree as ET
import requests
from datetime import datetime, timedelta, timezone

JOURNALS = [
    {
        "name": "ISPRS",
        "issns": ["0924-2716", "1872-8235"],
        "category": "ISPRS J P&RS"
    },
    {
        "name": "TGRS",
        "issns": ["0196-2892", "1558-0644"],
        "category": "IEEE TGRS"
    },
    {
        "name": "JSTARS",
        "issns": ["1939-1404", "2151-1535"],
        "category": "IEEE JSTARS"
    },
    {
        "name": "Remote Sensing",
        "issns": ["2072-4292"],
        "category": "Remote Sensing"
    },
    {
        "name": "RSE",
        "issns": ["0034-4257", "1879-0704"],
        "category": "RSE"
    },
    {
        "name": "JAG",
        "issns": ["1569-8432", "1872-826X"],
        "category": "JAG"
    },
    {
        "name": "GRSL",
        "issns": ["1545-598X", "1558-0571"],
        "category": "IEEE GRSL"
    },
    {
        "name": "GIScience & RS",
        "issns": ["1548-1603", "1943-7226"],
        "category": "GIScience & RS"
    }
]

def reconstruct_abstract(inverted_index):
    if not inverted_index:
        return "No abstract available in OpenAlex."
    try:
        positions = {}
        for word, pos_list in inverted_index.items():
            for pos in pos_list:
                positions[pos] = word
        sorted_words = [positions[i] for i in sorted(positions.keys())]
        return " ".join(sorted_words)
    except Exception as e:
        print(f"Error reconstructing abstract: {e}")
        return "No abstract available in OpenAlex."

_last_arxiv_request_time = 0.0

def fetch_arxiv_abstract(oa_url):
    """Fallback: fetch abstract from arXiv API if the paper has an arXiv preprint"""
    global _last_arxiv_request_time
    # 支持新版 ID (YYMM.NNNNN) 与旧版 ID (分类/YYMMNNN) 并保留版本号（版本号会在下方解析中被处理或由API接收）
    match = re.search(r'arxiv\.org/(?:abs|pdf)/([a-zA-Z\-]+(?:\.[a-zA-Z\-]+)?/\d{7}|\d{4}\.\d{4,5})(?:v\d+)?', oa_url)
    if not match:
        return None
    arxiv_id = match.group(1)
    
    # 针对旧版 ID（如 cs.CV/0312001），arXiv API 只接受大类前缀（如 cs/0312001）
    if '/' in arxiv_id:
        parts = arxiv_id.split('/')
        if len(parts) == 2 and '.' in parts[0]:
            arxiv_id = f"{parts[0].split('.')[0]}/{parts[1]}"
            
    # 遵守 arXiv API 3 秒频率限制
    now = time.time()
    elapsed = now - _last_arxiv_request_time
    if elapsed < 3.0:
        time.sleep(3.0 - elapsed)
    _last_arxiv_request_time = time.time()

    try:
        url = f'https://export.arxiv.org/api/query?id_list={arxiv_id}&max_results=1'
        resp = requests.get(url, timeout=15)
        if resp.status_code == 200:
            root = ET.fromstring(resp.content)
            entries = root.findall('{http://www.w3.org/2005/Atom}entry')
            if entries:
                summary_elem = entries[0].find('{http://www.w3.org/2005/Atom}summary')
                if summary_elem is not None and summary_elem.text:
                    abstract = summary_elem.text.strip().replace('\n', ' ')
                    return abstract
    except Exception as e:
        print(f"Failed to fetch arXiv abstract for {arxiv_id}: {e}", file=sys.stderr)
    return None

def find_arxiv_url(paper):
    """Find potential arXiv URL from various fields in OpenAlex response"""
    # 1. 优先从 open_access.oa_url 获取
    oa_url = paper.get("open_access", {}).get("oa_url")
    if oa_url and "arxiv.org" in oa_url:
        return oa_url
    
    # 2. 从 primary_location 查找
    prim_loc = paper.get("primary_location") or {}
    for field in ["landing_page_url", "pdf_url"]:
        url = prim_loc.get(field)
        if url and "arxiv.org" in url:
            return url
            
    # 3. 遍历所有 locations 查找
    for loc in paper.get("locations", []):
        if not loc:
            continue
        for field in ["landing_page_url", "pdf_url"]:
            url = loc.get(field)
            if url and "arxiv.org" in url:
                return url
                
    return None

def fetch_openalex_papers(issn_list, from_date, to_date):
    issn_str = "|".join(issn_list)
    page = 1
    papers = []
    
    headers = {
        "User-Agent": "daily-arXiv-ai-enhanced/1.0 (mailto:dw-dengwei@users.noreply.github.com)"
    }

    api_key = os.environ.get("OPENALEX_API_KEY", "")
    
    while True:
        url = "https://api.openalex.org/works"
        params = {
            "filter": f"primary_location.source.issn:{issn_str},from_publication_date:{from_date},to_publication_date:{to_date}",
            "per_page": 100,
            "page": page
        }
        if api_key:
            params["api_key"] = api_key
        
        print(f"Fetching page {page} for ISSNs {issn_list} from {from_date} to {to_date}...")
        try:
            response = requests.get(url, params=params, headers=headers, timeout=30)
            if response.status_code != 200:
                print(f"Failed to fetch: HTTP {response.status_code}. Response: {response.text}")
                break
                
            data = response.json()
            results = data.get("results", [])
            if not results:
                break
                
            papers.extend(results)
            
            # 判断是否有下一页
            meta = data.get("meta", {})
            count = meta.get("count", 0)
            per_page = meta.get("per_page", 100)
            if page * per_page >= count:
                break
                
            page += 1
        except Exception as e:
            print(f"Error during request: {e}")
            break
            
    return papers

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", type=str, default=None, help="The base date (today) in YYYY-MM-DD format. Yesterday of this date will be queried.")
    parser.add_argument("--from-date", type=str, default=None, help="Explicit start publication date in YYYY-MM-DD")
    parser.add_argument("--to-date", type=str, default=None, help="Explicit end publication date in YYYY-MM-DD")
    parser.add_argument("--output", type=str, required=True, help="Path to the output JSONL file to append")
    args = parser.parse_args()
    
    # 计算日期范围
    if args.from_date and args.to_date:
        from_date = args.from_date
        to_date = args.to_date
    else:
        if args.date:
            today_dt = datetime.strptime(args.date, "%Y-%m-%d")
        else:
            today_dt = datetime.now(timezone.utc)
        yesterday_dt = today_dt - timedelta(days=1)
        yesterday_str = yesterday_dt.strftime("%Y-%m-%d")
        # 由于 OpenAlex 存在收录延迟，只查询“昨天”一天极大概率由于延迟导致数据为空。
        # 故向前查询最近 7 天的文献。后续会有 check_stats.py 脚本基于过去 7 天的历史数据进行去重。
        from_dt = today_dt - timedelta(days=7)
        from_date = from_dt.strftime("%Y-%m-%d")
        to_date = yesterday_str
        
    print(f"Target publication date range: {from_date} to {to_date}", file=sys.stderr)

    api_key = os.environ.get("OPENALEX_API_KEY", "")
    if api_key:
        print(f"Using OpenAlex API key: {api_key[:4]}...{api_key[-4:]}", file=sys.stderr)
    else:
        print("No OPENALEX_API_KEY set, using anonymous access", file=sys.stderr)
    
    total_new_papers = 0
    formatted_papers = []
    
    for journal in JOURNALS:
        raw_papers = fetch_openalex_papers(journal["issns"], from_date, to_date)
        print(f"Journal {journal['name']} ({journal['category']}) found {len(raw_papers)} papers.", file=sys.stderr)

        total = len(raw_papers)
        abstract_ok = 0
        abstract_fallback = 0
        abstract_missing = 0
        
        for paper in raw_papers:
            openalex_id = paper.get("id", "").split("/")[-1]
            if not openalex_id:
                continue
                
            title = paper.get("title") or paper.get("display_name") or "No Title"
            
            # 作者提取
            authors = []
            for authorship in paper.get("authorships", []):
                author_name = authorship.get("author", {}).get("display_name")
                if author_name:
                    authors.append(author_name)
            if not authors:
                authors = ["Unknown Author"]
                
            # 还原摘要：优先用 OpenAlex inverted_index，其次 arXiv 回退
            summary = reconstruct_abstract(paper.get("abstract_inverted_index"))
            if summary == "No abstract available in OpenAlex.":
                arxiv_url = find_arxiv_url(paper)
                if arxiv_url:
                    arxiv_summary = fetch_arxiv_abstract(arxiv_url)
                    if arxiv_summary:
                        summary = arxiv_summary
                        abstract_fallback += 1
                    else:
                        abstract_missing += 1
                else:
                    abstract_missing += 1
            else:
                abstract_ok += 1
            
            # 链接
            abs_url = paper.get("doi") or paper.get("primary_location", {}).get("landing_page_url") or f"https://openalex.org/{openalex_id}"
            pdf_url = paper.get("primary_location", {}).get("pdf_url") or paper.get("open_access", {}).get("oa_url") or abs_url
            
            item = {
                "id": openalex_id,
                "title": title,
                "authors": authors,
                "categories": [journal["category"]],
                "comment": "",
                "summary": summary,
                "abs": abs_url,
                "pdf": pdf_url
            }
            
            formatted_papers.append(item)
            total_new_papers += 1

        print(f"  Abstract stats: {abstract_ok} from OpenAlex, {abstract_fallback} from arXiv fallback, {abstract_missing} missing", file=sys.stderr)

    if formatted_papers:
        # 确保输出目录存在
        output_dir = os.path.dirname(args.output)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
            
        # 以追加模式写入 JSONL
        with open(args.output, "a", encoding="utf-8") as f:
            for paper in formatted_papers:
                f.write(json.dumps(paper, ensure_ascii=False) + "\n")
        print(f"Successfully appended {len(formatted_papers)} OpenAlex papers to {args.output}")
    else:
        print("No papers found to append.")

if __name__ == "__main__":
    main()
