# Code Signing Guide

This document explains how to configure code signing for the Deep Protocol Analyzer Electron application.

## Overview

Code signing ensures that the application has not been tampered with and verifies the publisher's identity. On Windows, unsigned applications trigger SmartScreen warnings that discourage users from installing.

The project uses a custom signing script (`scripts/sign.js`) that integrates with `electron-builder` and supports:

- **Certificate file** signing (`.pfx` / `.p12`) — ideal for CI/CD pipelines
- **Certificate store** signing — ideal for local developer machines with a certificate installed
- **Unsigned builds** — for development and testing

---

## Obtaining a Code Signing Certificate

### Commercial Certificates (Recommended for Production)

Purchase a code signing certificate from a trusted Certificate Authority (CA):

| CA | Notes |
|----|-------|
| [DigiCert](https://www.digicert.com/signing/code-signing-certificates) | Recommended; EV certificates available |
| [Sectigo (Comodo)](https://www.sectigo.com/ssl-certificates-tls/code-signing) | Budget-friendly option |
| [GlobalSign](https://www.globalsign.com/en/code-signing-certificate) | Enterprise-focused |

> **Note:** As of 2023+, most CAs require hardware tokens (USB or HSM) for OV/EV code signing certificates. For CI/CD, consider cloud-based signing services like [DigiCert KeyLocker](https://www.digicert.com/keylocker) or [Azure Trusted Signing](https://learn.microsoft.com/en-us/azure/trusted-signing/).

### Self-Signed Certificates (Development/Testing Only)

For local development, you can create a self-signed certificate:

```powershell
# PowerShell — create a self-signed code signing certificate
New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject "CN=Deep Protocol Analyzer Dev" `
  -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(5)
```

> Self-signed certificates will still trigger SmartScreen warnings on end-user machines.

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CSC_LINK` | For file-based signing | Path to the `.pfx` / `.p12` certificate file |
| `CSC_KEY_PASSWORD` | For file-based signing | Password for the certificate file |
| `CSC_NAME` | For store-based signing | Certificate subject name (e.g. `"CN=Deep Protocol Analyzer"`) |
| `CSC_IDENTITY_AUTO_DISCOVERY` | Optional | Set to `false` to skip signing entirely |

---

## Building

### Development Build (Unsigned)

For local development, no certificate is needed. The signing script will log a warning and proceed with an unsigned build.

```bash
# Option 1: Use the convenience script
npm run build:unsigned

# Option 2: Set the environment variable explicitly
set CSC_IDENTITY_AUTO_DISCOVERY=false
npm run package
```

### Production Build (Signed with Certificate File)

```bash
# Set environment variables
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=your-password

# Build and package
npm run build:signed
```

### Production Build (Signed with Certificate Store)

```bash
# Set the certificate subject name
set CSC_NAME=CN=Deep Protocol Analyzer

# Build and package
npm run build:signed
```

---

## CI/CD Configuration

### GitHub Actions

```yaml
- name: Build and Sign
  env:
    CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
  run: npm run build:signed
```

Store the certificate file content as a base64-encoded GitHub secret:

```bash
base64 -i certificate.pfx | tr -d '\n'
# Copy the output and save as WIN_CSC_LINK secret
```

### GitLab CI

```yaml
build:win:
  variables:
    CSC_LINK: $CI_PROJECT_DIR/cert.pfx
  script:
    - echo "$WIN_CSC_B64" | base64 -d > cert.pfx
    - npm run build:signed
  only:
    - tags
```

---

## Troubleshooting

### "Could not locate signtool.exe"

Install the [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/) or ensure `signtool.exe` is on your `PATH`.

### SmartScreen Still Shows Warning

- New certificates need to build reputation over time. Use an EV certificate for immediate reputation.
- Ensure the timestamp server is reachable (`http://timestamp.digicert.com`).

### Build Fails with Certificate Errors

- Verify the certificate file path and password are correct.
- Ensure the certificate has not expired.
- For store-based signing, verify the certificate is in the `CurrentUser\My` store.

---

## References

- [electron-builder Code Signing Documentation](https://www.electron.build/code-signing)
- [Windows Authenticode Portable Executable Specification](https://learn.microsoft.com/en-us/windows-hardware/drivers/install/authenticode)
