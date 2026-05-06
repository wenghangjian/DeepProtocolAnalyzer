// scripts/sign.js
// electron-builder custom sign script
// Supports:
//   - Certificate file (CSC_LINK + CSC_KEY_PASSWORD env vars)
//   - Certificate store (CSC_NAME env var)
//   - Development mode (no signing, just log warning)

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Custom signing function for electron-builder.
 *
 * electron-builder calls this function with the configuration object
 * describing the file to be signed. The function must return a Promise.
 *
 * Environment variables:
 *   CSC_IDENTITY_AUTO_DISCOVERY  - Set to 'false' to skip signing entirely
 *   CSC_LINK                     - Path to the certificate file (.pfx / .p12)
 *   CSC_KEY_PASSWORD             - Password for the certificate file
 *   CSC_NAME                     - Certificate subject name (for certificate store lookup)
 *
 * @param {object} configuration - electron-builder sign configuration
 * @param {string} configuration.path - Path to the file to sign
 * @param {string} configuration.hash - Hash algorithm (e.g. 'sha256')
 * @param {boolean} configuration.isNest - Whether this is a nested signature
 */
exports.default = async function(configuration) {
  // Skip signing when explicitly disabled (e.g. CI dev builds)
  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('[sign] Skipping code signing (CSC_IDENTITY_AUTO_DISCOVERY=false)');
    return;
  }

  const certFile = process.env.CSC_LINK;
  const certPassword = process.env.CSC_KEY_PASSWORD;
  const certSubject = process.env.CSC_NAME;

  // No certificate configured — fall back to unsigned build
  if (!certFile && !certSubject) {
    console.warn('[sign] No certificate configured. Building unsigned.');
    console.warn('[sign] Set CSC_LINK+CSC_KEY_PASSWORD or CSC_NAME to enable signing.');
    return;
  }

  const filePath = configuration.path;
  const hash = configuration.hash || 'sha256';

  // Locate signtool.exe from the Windows SDK
  const signtool = findSigntool();
  if (!signtool) {
    console.error('[sign] Could not locate signtool.exe. Skipping signing.');
    return;
  }

  let args = ['sign'];

  // Timestamp server (RFC 3161)
  args.push('/tr', 'http://timestamp.digicert.com');
  args.push('/td', hash);

  // Digest algorithm
  args.push('/fd', hash);

  if (certFile) {
    // Sign using a certificate file (.pfx / .p12)
    const resolvedCert = path.resolve(certFile);
    if (!fs.existsSync(resolvedCert)) {
      console.error(`[sign] Certificate file not found: ${resolvedCert}`);
      return;
    }
    args.push('/f', resolvedCert);

    if (certPassword) {
      args.push('/p', certPassword);
    }
  } else if (certSubject) {
    // Sign using a certificate from the Windows certificate store
    args.push('/n', certSubject);
  }

  // Append signature (required for PE files that may already have a signature)
  args.push('/as');

  // The file to sign
  args.push(filePath);

  const cmd = `"${signtool}" ${args.join(' ')}`;

  try {
    console.log(`[sign] Signing: ${path.basename(filePath)}`);
    execSync(cmd, { stdio: 'inherit' });
    console.log(`[sign] Successfully signed: ${path.basename(filePath)}`);
  } catch (err) {
    console.error(`[sign] Failed to sign ${path.basename(filePath)}: ${err.message}`);
    // In CI, you may want to throw to fail the build:
    // throw err;
  }
};

/**
 * Attempt to locate signtool.exe from common Windows SDK paths.
 * @returns {string|null} Full path to signtool.exe or null
 */
function findSigntool() {
  // Check if signtool is already on PATH
  try {
    const result = execSync('where signtool.exe', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    const firstLine = result.trim().split(/\r?\n/)[0];
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch (_) {
    // Not on PATH, continue searching
  }

  // Common Windows SDK installation paths
  const programFiles = [
    process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
    process.env.ProgramFiles || 'C:\\Program Files',
  ];

  const sdkVersions = ['10', '8.1'];

  for (const pf of programFiles) {
    for (const ver of sdkVersions) {
      const sdkBase = path.join(pf, 'Windows Kits', ver, 'bin');
      if (!fs.existsSync(sdkBase)) continue;

      // Look for x64 subdirectory first, then x86
      for (const arch of ['x64', 'x86']) {
        const candidate = path.join(sdkBase, arch, 'signtool.exe');
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }

      // Some SDK versions don't have arch subdirectories
      const candidate = path.join(sdkBase, 'signtool.exe');
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}
