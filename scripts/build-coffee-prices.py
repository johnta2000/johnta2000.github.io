"""Merge sourced café prices into the static, searchable menu table."""
import html
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'tools/coffee'
data = json.loads((ROOT / 'compare/prices.json').read_text())
prices = {(i['cafe'], i['menuName'].lower()): i for i in data['items']}
page = (ROOT / 'index.html').read_text()
seen = set()
e = html.escape

def update(match):
    row = match.group()
    attrs = dict(re.findall(r'data-([\w-]+)="([^"]*)"', row.split('>')[0]))
    key = (attrs['cafe'], html.unescape(attrs['name']).lower())
    item = prices.get(key)
    if not item:
        return row
    seen.add(key)
    source = data['sources'][item['sourceId']]
    price = item['directPrice']
    diff = round(float(attrs['dd']) - price, 2) if item['sizeMatched'] else None
    row = re.sub(r'data-direct="[^"]*"', f'data-direct="{price:g}"', row)
    row = re.sub(r'data-diff="[^"]*"', f'data-diff="{diff:g}"' if diff is not None else 'data-diff=""', row)
    row = re.sub(r' data-source="[^"]*"', '', row)
    row = row.replace('<tr ', f'<tr data-source="{source["channel"]}" ', 1)
    cells = re.findall(r'<td\b[^>]*>.*?</td>', row)
    assert len(cells) == 5
    size = item['size']
    size_label = size + (' café' if not item['sizeMatched'] else '') if size else '—'
    row = row.replace(cells[1], f'<td class="size-col">{e(size_label)}</td>')
    hint = source['basis'] + ' ' + source['dateLabel']
    if item['variants']:
        hint += ' Sizes: ' + '; '.join(f'{v["size"]} ${v["price"]:.2f}' for v in item['variants'])
    suffix = '+' if item['startingPrice'] else ''
    source_html = f'<small class="price-source">{e(source["label"])}</small>'
    if len(item['variants']) > 1:
        source_html += '<small class="price-variant">' + ' · '.join(f'{e(v["size"])} ${v["price"]:.2f}' for v in item['variants'][1:]) + '</small>'
    if size and not item['sizeMatched']:
        source_html += f'<small class="mobile-size">{e(size)} café</small>'
    label = f'{item["menuName"]} café price ${price:.2f}{suffix}. {hint}'
    cell = f'<td class="price"><a href="{e(item["sourceUrl"])}" target="_blank" rel="noopener" title="{e(hint)}" aria-label="{e(label)}">${price:.2f}{suffix}</a>{source_html}</td>'
    row = row.replace(cells[3], cell)
    delta = f'+${diff:.2f}' if diff is not None and diff > 0 else f'${diff:.2f}' if diff is not None else '—'
    row = row.replace(cells[4], f'<td class="price difference" title="'+('DoorDash minus café price, same serving size' if diff is not None else 'Serving size not matched across both menus')+f'">{delta}</td>')
    return row

page = re.sub(r'<tr data-[\s\S]*?</tr>', update, page)
assert seen == set(prices), set(prices) - seen
page = re.sub(r'285 items · \d+ with both prices', f'285 items · {len(seen)} with both prices', page)
(ROOT / 'index.html').write_text(page)
print(f'Updated {len(seen)} sourced prices; {sum(i["sizeMatched"] for i in data["items"])} size-matched differences.')
