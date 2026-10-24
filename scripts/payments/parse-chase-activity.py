"""Convert a Chase activity CSV to reviewed, unassigned statement-review rows.

Usage: python3 parse-chase-activity.py INPUT.csv OUTPUT.json --title TITLE [--period-note NOTE]
Keep both private files outside the public repository. No balances or dates are inferred.
"""
import argparse
import csv
import datetime as dt
from decimal import Decimal
import hashlib
import io
import json
from pathlib import Path


def parse(source, title, period_note=''):
    raw = source.read_bytes()
    reader = csv.DictReader(io.StringIO(raw.decode('utf-8-sig')))
    required = {'Card', 'Transaction Date', 'Post Date', 'Description', 'Type', 'Amount'}
    if not required.issubset(reader.fieldnames or []):
        raise ValueError('Expected a Chase activity CSV with card, dates, description, type and amount.')
    kinds = {'Sale': 'purchase', 'Return': 'credit', 'Payment': 'payment', 'Fee': 'fee', 'Interest': 'interest'}
    rows, cards, signed_cents = [], set(), 0
    for line, record in enumerate(reader, 2):
        cards.add(record['Card'])
        date = dt.datetime.strptime(record['Transaction Date'], '%m/%d/%Y').date()
        dt.datetime.strptime(record['Post Date'], '%m/%d/%Y')
        value = Decimal(record['Amount']) * 100
        if not value.is_finite() or value != value.to_integral_value():
            raise ValueError(f'Invalid amount on CSV row {line}.')
        cents = int(value)
        kind = kinds.get(record['Type'])
        if not kind or not record['Description'].strip():
            raise ValueError(f'Unsupported activity on CSV row {line}.')
        if (kind in ['purchase', 'fee', 'interest'] and cents > 0) or (kind in ['credit', 'payment'] and cents < 0):
            raise ValueError(f'Unexpected amount sign on CSV row {line}.')
        signed_cents += cents
        rows.append(dict(date=date.isoformat(), description=record['Description'], amountCents=-cents, kind=kind, page=line))
    if len(cards) != 1 or not 1 <= len(rows) <= 500:
        raise ValueError('Import 1–500 transactions for exactly one card.')
    rows.sort(key=lambda r: (r['date'], r['page']))
    period = f"{rows[0]['date']} to {rows[-1]['date']}" + (f' · {period_note}' if period_note else '')
    if len(title) > 100 or len(period) > 100:
        raise ValueError('Keep title and period under 100 characters.')
    result = dict(title=title, period=period, dueDate='', balanceCents=-signed_cents,
                  sourceType='csv', sourceName=source.name, fingerprint=hashlib.sha256(raw).hexdigest(), rows=rows)
    assert sum(r['amountCents'] for r in rows) == result['balanceCents']
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('output', type=Path)
    parser.add_argument('--title', required=True)
    parser.add_argument('--period-note', default='')
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[2]
    if args.output.resolve().is_relative_to(repo):
        raise ValueError('Keep private reviewed data outside the public repository.')
    result = parse(args.source, args.title, args.period_note)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    args.output.chmod(0o600)
    print(f"Reviewed {len(result['rows'])} rows; exact-cent reconciliation passed. All rows will start unassigned.")
