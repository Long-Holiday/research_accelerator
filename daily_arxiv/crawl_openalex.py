import os
import json
import argparse
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

def fetch_openalex_papers(issn_list, from_date, to_date):
    issn_str = "|".join(issn_list)
    page = 1
    papers = []
    
    headers = {
        "User-Agent": "daily-arXiv-ai-enhanced/1.0 (mailto:dw-dengwei@users.noreply.github.com)"
    }
    
    while True:
        url = "https://api.openalex.org/works"
        params = {
            "filter": f"primary_location.source.issn:{issn_str},from_publication_date:{from_date},to_publication_date:{to_date}",
            "per_page": 100,
            "page": page
        }
        
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
    parser.add_argument("--date", type=str, default=None, help="The base date (today) in YYYY-MM-DD format. Yesterday of this date will be crawled.")
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
        from_date = yesterday_str
        to_date = yesterday_str
        
    print(f"Target publication date range: {from_date} to {to_date}")
    
    total_new_papers = 0
    formatted_papers = []
    
    for journal in JOURNALS:
        raw_papers = fetch_openalex_papers(journal["issns"], from_date, to_date)
        print(f"Journal {journal['name']} ({journal['category']}) found {len(raw_papers)} papers.")
        
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
                
            # 还原摘要
            summary = reconstruct_abstract(paper.get("abstract_inverted_index"))
            
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
