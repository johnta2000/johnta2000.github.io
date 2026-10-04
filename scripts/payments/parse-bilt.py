"""Parse a text-based Cardless Bilt statement into a private, reviewable JSON import.
Usage: python parse-bilt.py statement.pdf /private/tmp/statement.json
Never write statement output into the public website repository.
"""
import sys, re, json, hashlib, calendar
from pathlib import Path
from datetime import datetime
from decimal import Decimal
import pdfplumber


def cents(text):
    return int(Decimal(text.replace('$', '').replace(',', '')) * 100)


def parse(filename):
    raw = Path(filename).read_bytes()
    with pdfplumber.open(filename) as pdf:
        pages = [p.extract_text() or '' for p in pdf.pages]
    first = pages[0]
    def amount(label):
        match = re.search(label + r'\s+(-?\$[\d,]+\.\d{2})', first)
        if not match:
            raise ValueError('Missing statement field: ' + label)
        return cents(match[1])
    period = re.search(r'([A-Z][a-z]{2} \d{1,2})\s*[–-]\s*([A-Z][a-z]{2} \d{1,2}, \d{4})', first)
    if not period:
        raise ValueError('Statement period not recognized')
    end = datetime.strptime(period[2], '%b %d, %Y')
    start = datetime.strptime(period[1] + ', ' + str(end.year), '%b %d, %Y')
    if start > end:
        start = start.replace(year=end.year-1)
    due = re.search(r'\n([A-Z][a-z]{2} \d{1,2}, \d{4}) Credit limit', first)
    if not due:
        raise ValueError('Due date not recognized')
    balance = amount(r'New balance as of [^\n]+')
    opening = amount('Previous balance')
    purchases = amount(r'Purchases \(Including New Card Purchases\)')
    payments_credits = amount('Payments and credits')
    rows = []
    section = None
    current = None
    transaction = re.compile(r'^([A-Z][a-z]{2} \d{1,2}, \d{4}) (.+?) (-?\$[\d,]+\.\d{2})$')
    for page_num, page in enumerate(pages, 1):
        if page_num == 1:
            continue
        for line in page.splitlines():
            if line == 'Payments and credits':
                section = 'adjustment'; current = None; continue
            if line == 'Transactions':
                section = 'purchase'; current = None; continue
            if line in ['Fees', 'Interest charged', 'Interest charge calculation', 'Important disclosures']:
                section = None; current = None; continue
            if line.startswith('Total '):
                current = None; continue
            match = transaction.match(line)
            if match and section:
                date, description, value = match.groups()
                kind = section if section == 'purchase' else ('payment' if description == 'PAYMENT' else 'credit')
                current = dict(date=datetime.strptime(date, '%b %d, %Y').strftime('%Y-%m-%d'), description=description, amountCents=cents(value), kind=kind, page=page_num)
                rows.append(current)
            elif current and line not in ['Date Description Amount'] and not re.search(r'Cardless|issued by|@|Bilt Palladium Card|Page \d|^[A-Z][a-z]{2} \d.*[–-]', line):
                current['description'] += ' ' + line
            if line.startswith('Cardless Inc.'):
                current = None
    if sum(r['amountCents'] for r in rows if r['kind'] == 'purchase') != purchases:
        raise ValueError('Extracted purchases do not match statement purchase total; review manually')
    if sum(r['amountCents'] for r in rows if r['kind'] in ['payment', 'credit']) != payments_credits:
        raise ValueError('Extracted credits/payments do not match statement total; review manually')
    if opening:
        rows.append(dict(date=start.strftime('%Y-%m-%d'),description='Previous statement balance',amountCents=opening,kind='opening',page=1))
    if sum(r['amountCents'] for r in rows) != balance:
        raise ValueError('Statement does not reconcile. Review fees, interest, or unsupported sections manually.')
    return dict(title='Bilt · '+calendar.month_name[end.month]+' '+str(end.year),period=period[0],dueDate=datetime.strptime(due[1],'%b %d, %Y').strftime('%Y-%m-%d'),balanceCents=balance,fingerprint=hashlib.sha256(raw).hexdigest(),rows=rows)

if __name__ == '__main__':
    result = parse(sys.argv[1])
    output = Path(sys.argv[2]).resolve()
    repo = Path(__file__).resolve().parents[2]
    if output.is_relative_to(repo):
        raise ValueError('Save private statement data outside the public repository')
    output.write_text(json.dumps(result,indent=2))
    output.chmod(0o600)
    print(f"Parsed {len(result['rows'])} items; reconciled balance ${result['balanceCents']/100:,.2f}")
