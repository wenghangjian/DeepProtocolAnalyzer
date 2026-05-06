# Deep Protocol Analyzer (DPA)

An industrial multi-protocol analyzer and simulator built with Electron, React, and TypeScript. Designed for SCADA/ICS engineers to test, debug, and analyze industrial communication protocols.

## Features

### Supported Protocols (9 engines)

| Protocol | Transport | Status | Key Capabilities |
|----------|-----------|--------|------------------|
| Modbus TCP | TCP | ✅ Full | FC01-FC16, all data types |
| Modbus RTU | Serial | ✅ Full | FC01-FC16, CRC-16 |
| Custom TCP | TCP | ✅ Full | HEX/ASCII/raw send, timed auto-send, CRC/LRC |
| Custom Serial | Serial | ✅ Full | HEX/ASCII/raw send, timed auto-send, CRC/LRC |
| DNP3 | TCP | ✅ Full | Class 0-3 polls, Read/Write/Select/Operate, 6 object groups |
| OPC UA | TCP | ✅ Full | Browse/Read/Write, Subscriptions, MonitoredItems |
| IEC 60870-5-104 | TCP | ✅ Full | GI/CI, 19 ASDU types, commands, CP56Time2a |
| BACnet/IP | UDP | ✅ Full | Who-Is/I-Am, ReadProperty/WriteProperty, 52 object types |
| IEC 61850 (MMS) | TCP | ✅ Full | Browse/Read/Write, TPKT/COTP, ASN.1 BER |

### Traffic Analysis
- HEX/BIN/ASCII/STRUCTURED view modes
- Protocol-aware structured decoding (Modbus, DNP3, IEC 104)
- Search, filter by direction/protocol/errors
- Export to TXT/BIN files
- Auto-scroll with pause/resume

### Session Management
- Multi-session support (concurrent connections)
- Session config persistence (auto-save/restore)
- Config template import/export
- Credential encryption (Windows Credential Manager)

### Poll Task Management
- Automated periodic reads with configurable intervals
- Per-task start/stop controls
- Statistics dashboard (success rate, response time)
- Task history with error highlighting

### Performance Monitoring
- Throughput benchmarking (messages/sec with latency percentiles)
- Memory benchmarking (heap/RSS tracking)
- Concurrent session benchmarking
- Spec compliance validation (§16 requirements)

### Security
- Content Security Policy (CSP) headers
- Zod runtime validation for IPC messages
- Credential encryption via Windows Credential Manager
- Code signing support (Windows)

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Electron Main Process                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ IPC      │  │ Session  │  │ Plugin   │  │ Config  │ │
│  │ Router   │  │ Manager  │  │ Scanner  │  │ Manager │ │
│  └────┬─────┘  └────┬─────┘  └──────────┘  └─────────┘ │
│       │              │                                   │
│  ┌────┴──────────────┴──────┐                           │
│  │   utilityProcess × N     │  ← Protocol Workers       │
│  │  ┌─────────────────────┐ │                           │
│  │  │ Protocol Engine     │ │  ← 9 engines              │
│  │  │ Transport Layer     │ │  ← TCP/Serial/UDP         │
│  │  └─────────────────────┘ │                           │
│  └──────────────────────────┘                           │
├─────────────────────────────────────────────────────────┤
│                    Preload (contextBridge)                │
│  sessionApi │ protocolApi │ trafficApi │ taskApi │ ...   │
├─────────────────────────────────────────────────────────┤
│                    Renderer (React + Vite)                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌─────────┐ │
│  │ Session  │  │ Traffic  │  │ Poll     │  │ Perf    │ │
│  │ Manager  │  │ Monitor  │  │ Tasks    │  │ Monitor │ │
│  └──────────┘  └──────────┘  └──────────┘  └─────────┘ │
└─────────────────────────────────────────────────────────┘
```

## Getting Started

### Prerequisites
- Node.js 18+ (recommended: 22+)
- npm 9+
- Windows 10/11 (for full serial port and credential manager support)

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

> **Note:** `npm run dev` and `npm run electron` clear `ELECTRON_RUN_AS_NODE` before launching. This project will not boot correctly if that environment variable is set to `1`.

### Build
```bash
# Unsigned build
npm run build:unsigned

# Signed build (requires certificate)
npm run build:signed
```

### Testing
```bash
# Run all tests
npm test

# Unit tests only
npx vitest run tests/unit/

# Integration tests only
npx vitest run tests/integration/

# E2E tests
npx playwright test
```

## Project Structure

```
deep-protocol-analyzer/
├── apps/
│   ├── main/              # Electron main process
│   ├── preload/           # Preload bridge (contextBridge)
│   ├── protocol-worker/   # Protocol worker (utilityProcess)
│   └── renderer/          # (legacy, use src/)
├── packages/
│   ├── benchmark/         # Performance benchmarking
│   ├── config-manager/    # Config & template management
│   ├── credential-store/  # Windows Credential Manager integration
│   ├── protocol-core/     # Session kernel & types
│   ├── protocol-sdk/      # Base protocol driver
│   ├── shared-types/      # Shared TypeScript types
│   └── transport-core/    # TCP/Serial/UDP transports
├── protocols/
│   ├── _shared/           # Shared protocol utilities
│   ├── bacnet-ip/         # BACnet/IP engine
│   ├── custom-serial/     # Custom Serial engine
│   ├── custom-tcp/        # Custom TCP engine
│   ├── dnp3/              # DNP3 engine
│   ├── iec104/            # IEC 60870-5-104 engine
│   ├── iec61850/          # IEC 61850 (MMS) engine
│   ├── modbus-rtu/        # Modbus RTU engine
│   ├── modbus-tcp/        # Modbus TCP engine
│   └── opcua/             # OPC UA engine
├── scripts/               # Build scripts
├── src/                   # React renderer source
│   ├── components/        # UI components
│   │   └── ui/            # Reusable UI primitives
│   ├── store/             # Zustand state management
│   ├── theme.ts           # Design tokens
│   └── types/             # TypeScript declarations
└── tests/
    ├── e2e/               # Playwright E2E tests
    ├── integration/       # Integration tests with mock simulators
    └── unit/              # Unit tests
```

## Testing

The project has comprehensive test coverage:
- **569 unit tests** across 12 test files
- **45 integration tests** with mock protocol simulators
- **13 E2E tests** for UI workflows

## Documentation

- [Spec v1.3](industrial_multi_protocol_simulator_spec_v1_3.md) — Full specification
- [Code Signing Guide](docs/CODE_SIGNING.md) — How to sign builds
- [Session Kernel Design](docs/superpowers/specs/2026-04-28-protocol-session-kernel-design.md)
- [OPC UA/IEC 104 Capabilities](docs/superpowers/plans/2026-04-29-opcua-iec104-capabilities.md)

## License

Proprietary — All rights reserved.
