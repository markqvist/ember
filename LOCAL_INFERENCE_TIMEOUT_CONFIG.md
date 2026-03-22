# Local Inference Timeout Configuration

## Problem

When using OpenMAIC with local/self-hosted LLM inference (e.g., llama.cpp, vLLM, etc.), large models can take significant time to generate responses. The default Node.js fetch implementation (undici) has timeouts that may cause "Headers Timeout Error" or similar connection failures.

## Solution

The system now automatically detects local inference endpoints and supports configurable timeouts via environment variables.

## Configuration

### Environment Variables

| Variable | Description | Default | Unit |
|----------|-------------|---------|------|
| `LLM_EXTENDED_TIMEOUT` | Force-enable extended timeouts for all providers | `false` | boolean |
| `LLM_CONNECT_TIMEOUT_SEC` | TCP connection timeout | `0` (disabled) | seconds |
| `LLM_HEADERS_TIMEOUT_SEC` | Timeout for receiving response headers | `0` (disabled) | seconds |
| `LLM_BODY_TIMEOUT_SEC` | Timeout for receiving response body | `0` (disabled) | seconds |

### Automatic Local Inference Detection

Extended timeouts are automatically enabled when the base URL matches:
- `localhost`
- `127.0.0.1`
- `192.168.x.x` (private LAN)
- `10.x.x.x` (private LAN)

### Recommended Settings for Large Local Models

For 1T parameter models or other very large local inference:

```bash
# .env.local or environment configuration
LLM_HEADERS_TIMEOUT_SEC=1800    # 30 minutes for headers (time to first token)
LLM_BODY_TIMEOUT_SEC=3600       # 60 minutes for complete response
```

Or disable timeouts entirely (0 = no timeout):

```bash
LLM_HEADERS_TIMEOUT_SEC=0
LLM_BODY_TIMEOUT_SEC=0
```

### Example: llama.cpp / llama-server

```bash
# In your .env.local file
LLM_HEADERS_TIMEOUT_SEC=1800
LLM_BODY_TIMEOUT_SEC=3600
```

### Example: vLLM / TGI / Other Local Endpoints

```bash
# Force extended timeouts even if auto-detection doesn't match
LLM_EXTENDED_TIMEOUT=true
LLM_HEADERS_TIMEOUT_SEC=1800
LLM_BODY_TIMEOUT_SEC=3600
```

## Technical Details

- Uses undici's `Agent` with custom timeout dispatcher options
- Timeouts are applied per-request, not global
- 0 seconds = disabled (no timeout)
- The fix is applied to OpenAI-compatible providers and native OpenAI when pointing to local endpoints
- A single log message is emitted on first request to confirm timeout configuration

## Verification

When extended timeouts are active, you'll see this log message on first inference:

```
[LLM Timeout] Using extended timeouts for openai: connect=0s, headers=1800s, body=3600s (0=disabled)
```

## Troubleshooting

### Still getting timeout errors?

1. Check that environment variables are loaded: `console.log(process.env.LLM_HEADERS_TIMEOUT_SEC)`
2. Ensure you're using the OpenAI provider type with your local endpoint
3. Verify the base URL contains localhost/127.0.0.1 or set `LLM_EXTENDED_TIMEOUT=true`
4. Check application logs for the timeout configuration message

### Headers vs Body Timeout

- **Headers Timeout**: Time until the first response headers are received (time to first token)
- **Body Timeout**: Time for the entire response body to be received (total generation time)

For large models, headers timeout is usually the critical one since generation can take minutes before the first token is produced.
