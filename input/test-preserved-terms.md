---
title: '测试保留术语'
date: 2026-04-25
categories:
  - 测试
draft: false
---

## 介绍

这是一个用于测试保留术语的文章。

## API 和 Token

在使用第三方服务时，我们需要先获取 API Key 和 token。这些凭证用于身份验证。

### SDK 示例

```javascript
const sdk = new ThirdPartySDK({
  apiKey: 'your-api-key',
  token: 'your-token'
});
```

## HTTP 请求

可以通过 fetch API 发送 HTTP 请求：

```bash
curl -X GET https://api.example.com/data -H "Authorization: Bearer YOUR_TOKEN"
```

## 总结

请确保妥善保管好您的 API Key 和 token，不要泄露给他人。