"""Invalid uploads: one request per case, no retries or raw response logging."""
import argparse, base64, json, urllib.error, urllib.parse, urllib.request

ENDPOINT = 'https://marindsain8n.ru/webhook/ekt-attachment-extract'


def payload(name, mime, data):
    return {'fileName': name, 'mimeType': mime,
            'dataUrl': 'data:' + mime + ';base64,' + base64.b64encode(data).decode()}


def cases():
    yield 'empty', {}
    yield 'script', payload('bad.exe', 'application/octet-stream', b'MZ-not-a-file')
    yield 'mismatched_signature', payload('bad.pdf', 'application/pdf', b'not a PDF')
    yield 'wrong_mime', payload('bad.pdf', 'text/csv', b'sku,name\nA,B')
    yield 'url', {'fileName': 'bad.pdf', 'mimeType': 'application/pdf', 'dataUrl': 'https://127.0.0.1/private'}
    yield 'oversized', payload('large.csv', 'text/csv', b'a' * (5 * 1024 * 1024 + 1))
    yield 'bad_base64', {'fileName': 'bad.csv', 'mimeType': 'text/csv', 'dataUrl': 'data:text/csv;base64,!bad'}


def check(name, data, endpoint):
    req = urllib.request.Request(endpoint, json.dumps(data).encode(),
                                 {'Content-Type': 'application/json'}, method='POST')
    status, result, error = 0, {}, None
    try:
        try:
            response = urllib.request.urlopen(req, timeout=20)
        except urllib.error.HTTPError as exc:
            response = exc
        with response:
            status = response.status
            raw = response.read(65537)
        try:
            result = json.loads(raw)
            if not isinstance(result, dict):
                result = {}
        except ValueError:
            result = {}
    except (urllib.error.URLError, TimeoutError, OSError) as exc:
        error = type(exc).__name__
    passed = (status == 400 and result.get('error') == 'invalid_attachment') or (name == 'oversized' and status == 413)
    return {'test': name, 'status': status, 'pass': passed, 'error_type': error}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--endpoint', default=ENDPOINT, help='HTTP(S) extraction endpoint; HTTP allowed for local Docker.')
    args = parser.parse_args(argv)
    parsed = urllib.parse.urlparse(args.endpoint)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc or parsed.username or parsed.password:
        parser.error('--endpoint must be HTTP(S) without embedded credentials')
    results = []
    for name, data in cases():
        result = check(name, data, args.endpoint)
        results.append(result)
        print(json.dumps(result, ensure_ascii=False), flush=True)
    return 0 if all(result['pass'] for result in results) else 1


if __name__ == '__main__':
    raise SystemExit(main())
