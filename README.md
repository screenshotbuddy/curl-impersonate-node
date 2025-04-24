# node-curl-impersonate

node-curl-impersonate is a library that allows for you to use curl-impersonate natively, providing an easy interface for passing headers, flags, and other information for your request. This library specifically is used to bypass TLS Fingerprinting that is present on some cloudflare or other DDOS protected sites. I do not support using this for malicious purposes, only to demonstrate that TLS Fingerprinting is not a safe way to secure your website from web scrapers, and to show how easy web scraping is in general.

## All credit goes to

https://github.com/wearrrrr/curl-impersonate-node

fixed issue with large page support
