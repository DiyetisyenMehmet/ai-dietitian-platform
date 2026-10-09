'use strict';
// ConnectivityService output is held only in memory. Inspect the active network
// agent, never historical events or another network's validation state.
function defaultNetworkReady(output) {
  const active = output.match(/^\s*Active default network:\s*(\d+)\s*$/m)?.[1];
  if (!active) return false;
  return output.split('\n').some(line => {
    if (!/^\s*NetworkAgentInfo[\[{]/.test(line) || !line.includes('network{' + active + '}')) return false;
    const capabilities = line.match(/Capabilities:\s*([^\]]+)/)?.[1] || '';
    return /\bINTERNET\b/.test(capabilities) && /\bVALIDATED\b/.test(capabilities);
  });
}
module.exports = { defaultNetworkReady };
