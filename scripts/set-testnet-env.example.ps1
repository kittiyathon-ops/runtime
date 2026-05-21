# Copy this file to a local untracked file before adding credentials, for example:
#   Copy-Item scripts\set-testnet-env.example.ps1 scripts\set-testnet-env.local.ps1
# Then edit only the local copy and run:
#   . .\scripts\set-testnet-env.local.ps1

$env:BINANCE_API_KEY = "CYyv62Rhpi15iXGwN8p5XOMjmcas2TGDYunTLgPJ9ScNVIno6YeNgqIHAaBC7xO3"
$env:BINANCE_API_SECRET = "KnrCc0teHTW0KIEXjEmI9ObPA8lBMYNNWlsCbiXVdrWAYcQn7KupcJQ6wPqZuPLw"

$env:BINANCE_USE_TESTNET = "true"
$env:BINANCE_FUTURES_REST_URL = "https://demo-fapi.binance.com"
$env:BINANCE_FUTURES_USER_STREAM_BASE_URL = "wss://stream.binancefuture.com"
$env:BINANCE_FUTURES_MARKET_WS_BASE_URL = "wss://stream.binancefuture.com"
$env:BINANCE_FUTURES_WS_API_URL = "wss://testnet.binancefuture.com/ws-fapi/v1"

$env:RUNTIME_PROFILE = "LIVE"
$env:DRY_RUN = "false"
$env:KILL_SWITCH = "false"
$env:LIVE_TRADING_CONFIRMATION = "I_UNDERSTAND_THIS_TRADES_REAL_MONEY"

$env:ALLOW_TESTNET_TINY_ORDER = "true"
$env:ALLOW_MARKET_ORDERS = "false"
$env:MAX_ORDER_NOTIONAL_USD = "60"
$env:MAX_EXPOSURE_USD = "60"
$env:TESTNET_TINY_ORDER_SYMBOL = "BTCUSDT"

Write-Host "TESTNET environment variables loaded for this PowerShell session."
Write-Host "REST endpoint: $env:BINANCE_FUTURES_REST_URL"
Write-Host "Market WS: $env:BINANCE_FUTURES_MARKET_WS_BASE_URL"
Write-Host "User stream WS: $env:BINANCE_FUTURES_USER_STREAM_BASE_URL"
Write-Host "WS API: $env:BINANCE_FUTURES_WS_API_URL"
Write-Host "API key length: $($env:BINANCE_API_KEY.Length)"
Write-Host "API secret length: $($env:BINANCE_API_SECRET.Length)"
