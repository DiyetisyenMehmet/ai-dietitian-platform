"""Synthetic mascot-only API acceptance. No onboarding, AI, mail or health data."""
import http.cookiejar
import json
import secrets
import sys
import urllib.request
import urllib.error

IDS = ['classic', 'diewish-robot', 'minis', 'bilge', 'enerjik', 'lina', 'bulut', 'yesil-damla',
       'minik-bulut', 'mirmir', 'dost', 'nox', 'fit', 'guclu', 'tombis', 'mini-robot']

class AcceptanceHttpError(RuntimeError):
    """Only method/path/status are safe to report; never response bodies or credentials."""

def run(base):
    allowed = ['https://staging.diewish.com',
               'https://mascot-candidate---diewish-backend-staging-2qqqfr7wzq-ew.a.run.app']
    if base not in allowed:
        raise RuntimeError('Non-staging target rejected')
    jar = http.cookiejar.CookieJar()
    client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
    token = None
    def call(path, method='GET', data=None, authenticated=True):
        headers = {'Origin': 'https://staging.diewish.com', 'Content-Type': 'application/json'}
        if authenticated and token:
            headers['Authorization'] = 'Bearer ' + token
        request = urllib.request.Request(base + '/api' + path, method=method, headers=headers,
                                         data=None if data is None else json.dumps(data).encode())
        try:
            with client.open(request, timeout=35) as response:
                value = json.load(response)
                if not value.get('success'):
                    raise RuntimeError('API acceptance failed')
                return value.get('data', {})
        except urllib.error.HTTPError as error:
            raise AcceptanceHttpError(f'{method} {path}: HTTP {error.code}') from None
    email = 'mascot.release.' + secrets.token_hex(10) + '@example.invalid'
    password = 'MascotRelease1!' + secrets.token_hex(12)
    registered = call('/auth/register', 'POST', {'email': email, 'password': password,
                                               'fullName': 'Synthetic Mascot Release'}, False)
    token = registered['tokens']['accessToken']
    try:
        if call('/account/mascot')['preferences']['mascotId'] != 'classic':
            raise RuntimeError('Default preference changed')
        for identity in IDS:
            changed = call('/account/mascot', 'PATCH', {'mascotId': identity})
            if changed['preferences']['mascotId'] != identity or call('/account/mascot')['preferences']['mascotId'] != identity:
                raise RuntimeError('Mascot readback failed')
        refreshed = call('/auth/refresh-token', 'POST', {}, False)
        token = refreshed['tokens']['accessToken']
        if call('/account/mascot')['preferences']['mascotId'] != IDS[-1]:
            raise RuntimeError('Refresh preference persistence failed')
        call('/auth/logout', 'POST', {})
        logged = call('/auth/login', 'POST', {'email': email, 'password': password}, False)
        token = logged['tokens']['accessToken']
        if call('/account/mascot')['preferences']['mascotId'] != IDS[-1]:
            raise RuntimeError('Login preference persistence failed')
        print('PASS: 16 mascot identities PATCH/GET, default, refresh-cookie, logout/login persistence')
    finally:
        # Respect the existing deletion request/grace policy. This revokes refresh
        # sessions; permanent purge stays pending. Never bypass it with DB deletes.
        deletion = call('/account/deletion/request', 'POST', {'password': password})
        if not deletion.get('deletionRequestedAt') or not deletion.get('purgeEligibleAt') or not isinstance(deletion.get('graceDays'), int):
            raise RuntimeError('Deletion request was not confirmed')
        print('PASS: synthetic account deletion requested and refresh sessions revoked; permanent purge PENDING under the existing grace policy')

if __name__ == '__main__':
    try:
        run(sys.argv[1])
    except AcceptanceHttpError as error:
        print('NO_GO: ' + str(error) + '; response body and credentials withheld', file=sys.stderr)
        sys.exit(1)
    except Exception:
        print('NO_GO: synthetic mascot acceptance failed; account/token/password/error body withheld', file=sys.stderr)
        sys.exit(1)
