"""Bounded read-only staging metadata. Never export raw logs, identities or AI bodies."""
import json
import os
import subprocess

PROJECT = 'project-a2e260c1-839d-4f1d-b90'
REGION = 'europe-west1'
SERVICES = ('diewish-backend-staging', 'diewish-frontend-staging')
APPROVED_SHA = '390e3567c37b4529d3b18da3ee040148d63750d9'
WINDOWS = (
    ('first-display', '2026-10-15T20:06:20Z', '2026-10-15T20:08:20Z'),
    ('second-502', '2026-10-15T20:11:55Z', '2026-10-15T20:13:15Z'),
)
MESSAGES = {
    'Nutrition plan generation phase timings': 'generation-completed',
    'Nutrition plan generation failed': 'generation-failed',
    'Nutrition-plan batch generation started': 'batch-started',
    'Nutrition-plan batch generation completed': 'batch-completed',
    'Nutrition-plan batch generation failed': 'batch-failed',
    'Vertex AI request failed': 'provider-transport-failed',
    'Vertex AI returned an error': 'provider-http-error',
    'Vertex AI returned a transient error; retrying once': 'provider-transient-retry',
    'Vertex AI transport failed; retrying once': 'provider-transport-retry',
    'Vertex AI returned an invalid response envelope': 'provider-envelope-invalid',
    'Vertex AI retry did not produce a complete response': 'provider-output-incomplete',
    'Vertex AI exhausted the output budget; retrying once': 'provider-output-budget-retry',
    'Vertex AI blocked a structured response': 'provider-structured-block',
    'Vertex AI returned no usable content': 'provider-output-empty',
    'Request failed': 'request-failed',
    'Nutrition-plan batch failed deterministic validation; retrying once': 'validation-retry',
    'Nutrition-plan batch remained outside deterministic real-life policy after retry': 'realism-rejected',
    'Nutrition-plan batch remained outside deterministic nutrition tolerances after retry': 'nutrition-rejected',
    'Nutrition-plan batch still contained allergen(s) after retry; rejecting batch': 'allergen-rejected',
    'Nutrition-plan provider returned the wrong number of days after retry': 'day-count-rejected',
    'Nutrition-plan provider returned an invalid meal structure after retry': 'meal-structure-rejected',
}
CODES = {
    'AI_PROVIDER_UNREACHABLE', 'AI_PROVIDER_ERROR', 'AI_PROVIDER_MALFORMED',
    'AI_PROVIDER_EMPTY', 'AI_PROVIDER_INCOMPLETE', 'AI_PROVIDER_BLOCKED', 'VERTEX_CREDENTIALS_UNAVAILABLE',
    'NUTRITION_PLAN_INCOMPLETE', 'NUTRITION_PLAN_MEAL_STRUCTURE_MISMATCH',
    'NUTRITION_PLAN_ALLERGEN_VALIDATION_FAILED', 'NUTRITION_PLAN_TARGET_MISMATCH',
    'NUTRITION_PLAN_REALISM_VALIDATION_FAILED', 'NUTRITION_PLAN_GENERATION_TIMEOUT',
    'NUTRITION_PLAN_GENERATION_BUSY', 'NUTRITION_PLAN_GENERATION_IN_PROGRESS',
    'P2028', 'INTERNAL_SERVER_ERROR',
}
NUMBERS = ('elapsedMs', 'processingTimeMs', 'attempt', 'startDayNumber', 'batchDays',
           'durationDays', 'requestedDays', 'receivedDays', 'violationCount', 'status', 'statusCode')


def project_entry(row):
    # No arbitrary message, stack, URL, error detail, header or user field survives.
    payload = row.get('jsonPayload', {})
    if not payload and isinstance(row.get('textPayload'), str):
        try:
            payload = json.loads(row['textPayload'])
        except ValueError:
            payload = {}
    if not isinstance(payload, dict):
        payload = {}
    output = {}
    if payload.get('msg') in MESSAGES:
        output['event'] = MESSAGES[payload['msg']]
        for key in NUMBERS:
            value = payload.get(key)
            if type(value) in (int, float) and 0 <= value <= 10_000_000:
                output[key] = value
        error = payload.get('err')
        code = payload.get('code') or (error.get('code') if isinstance(error, dict) else None)
        if code in CODES:
            output['code'] = code
    request = row.get('httpRequest', {})
    url = request.get('requestUrl', '').split('?', 1)[0]
    if url.endswith('/api/nutrition-plans/generate'):
        output['event'] = 'generation-http-response'
        if type(request.get('status')) is int:
            output['httpStatus'] = request['status']
        latency = request.get('latency', '')
        if isinstance(latency, str) and latency.endswith('s'):
            try:
                output['latencyMs'] = round(float(latency[:-1]) * 1000)
            except ValueError:
                pass
    if not output:
        return None
    timestamp = row.get('timestamp', '')
    if isinstance(timestamp, str) and len(timestamp) <= 40 and timestamp.startswith('2026-10-15T'):
        output['timestamp'] = timestamp
    return output


def read(*args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60, check=False)
    if result.returncode:
        raise RuntimeError('staging-metadata-read-unavailable')
    return json.loads(result.stdout)


def main():
    if os.environ.get('GITHUB_REF') != 'refs/heads/feature/staging-preview':
        raise RuntimeError('protected-staging-ref-required')
    if os.environ.get('PROJECT_ID') != PROJECT:
        raise RuntimeError('isolated-staging-project-required')
    for service in SERVICES:
        data = read('gcloud', 'run', 'services', 'describe', service,
                    '--project', PROJECT, '--region', REGION, '--format=json')
        traffic = [row for row in data['status'].get('traffic', []) if row.get('percent', 0) > 0]
        for target in traffic:
            revision = target['revisionName']
            runtime = read('gcloud', 'run', 'revisions', 'describe', revision,
                           '--project', PROJECT, '--region', REGION, '--format=json')
            variables = {entry['name']: entry for entry in runtime['spec']['containers'][0].get('env', [])}
            report = {'service': service, 'trafficPercent': target['percent']}
            if service == SERVICES[0]:
                report['approvedSource'] = variables.get('DIEWISH_APPLICATION_SHA', {}).get('value') == APPROVED_SHA
            if service == SERVICES[0]:
                report['nutritionExplicitlyDisabled'] = variables.get('NUTRITION_JOBS_ENABLED') == {'name': 'NUTRITION_JOBS_ENABLED', 'value': 'false'}
                report['runtimeStaging'] = variables.get('DIEWISH_ENVIRONMENT', {}).get('value') == 'staging'
            print(json.dumps({'runtime': report}), flush=True)
    for label, start, end in WINDOWS:
        query = (f'resource.type="cloud_run_revision" AND resource.labels.service_name=("{SERVICES[0]}" OR "{SERVICES[1]}") '
                 f'AND timestamp>="{start}" AND timestamp<="{end}" '
                 'AND (httpRequest.requestUrl:"/api/nutrition-plans/generate" OR jsonPayload.msg:"Nutrition" OR jsonPayload.msg:"Vertex AI" OR jsonPayload.msg="Request failed")')
        rows = read('gcloud', 'logging', 'read', query, '--project', PROJECT,
                    '--limit', '1000', '--order=asc', '--format=json')
        safe = [entry for row in rows if (entry := project_entry(row))]
        print(json.dumps({'window': label, 'state': 'DATA' if safe else 'NO_RECOGNIZED_EVENTS',
                          'rowsRead': len(rows), 'possiblyTruncated': len(rows) == 1000,
                          'events': safe}), flush=True)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, ValueError, KeyError, TypeError, subprocess.TimeoutExpired) as error:
        reason = str(error) if type(error) is RuntimeError else type(error).__name__
        print(json.dumps({'result': 'BLOCKED', 'reason': reason}), flush=True)
        raise SystemExit(2)
