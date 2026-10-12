"""Existing manager capability check; no secret payload, IAM or runtime mutations."""
import json
import subprocess
import urllib.error
import urllib.request

PROJECT = "project-a2e260c1-839d-4f1d-b90"
CHECKS = (
    ("SIR_SURUM_EKLEME", "diewish-staging-database-url", "secretmanager.versions.add"),
    ("GECIS_SIRRI_OKUMA", "diewish-staging-direct-database-url", "secretmanager.versions.access"),
)


def main():
    def gcloud(*args):
        result = subprocess.run(["gcloud", *args], capture_output=True, text=True, timeout=30)
        if result.returncode:
            raise RuntimeError("gcloud-unavailable")
        return result.stdout.strip()

    if gcloud("config", "get-value", "project") != PROJECT:
        print("SONUC=STAGING_PROJESINI_SECIN")
        return 2
    # The existing account token stays in memory and is never printed or saved.
    token = gcloud("auth", "print-access-token")
    results = []
    for label, secret, permission in CHECKS:
        request = urllib.request.Request(
            f"https://secretmanager.googleapis.com/v1/projects/{PROJECT}/secrets/{secret}:testIamPermissions",
            data=json.dumps({"permissions": [permission]}).encode(),
            headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                result = permission in json.load(response).get("permissions", [])
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError):
            result = None
        results.append(result)
        print(label + "=" + ("VAR" if result is True else "YOK" if result is False else "BELIRSIZ"))
    if all(value is True for value in results):
        print("SONUC=MEVCUT_HESAP_YOLU_UYGUN")
        # This is a permission diagnostic. The actual future write remains
        # subject to API authorization and the separate approval decision.
        return 0
    print("SONUC=" + ("BELIRSIZ" if None in results else "YETKI_EKSIK"))
    return 3


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, subprocess.TimeoutExpired):
        # Do not expose gcloud stderr, tokens or arbitrary exception messages.
        print("SONUC=MEVCUT_HESAP_DOGRULANAMADI")
        raise SystemExit(2)
